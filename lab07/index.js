require('dotenv').config();

const http = require('http');
const fs = require('fs');
const path = require('path');
const express = require('express');//спрощує стаорення API
const multer = require('multer');//middleware для завантаження фото
const swaggerJsDoc = require('swagger-jsdoc'); //для документації
const swaggerUi = require('swagger-ui-express');
const db = require('./db');

const app = express();

const options = {
    host: process.env.HOST,
    port: process.env.PORT,
    cache: process.env.CACHE_PATH
};

const cachePath = path.resolve(options.cache);//відносний шлях->абсолютний
if (!fs.existsSync(cachePath)) {
    fs.mkdirSync(cachePath, { recursive: true });//створює папку кешу
}

const storage = multer.diskStorage({//збереження фото в кеші
    destination: (req, file, cb) => cb(null, cachePath),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

app.use(express.json());//дозвіл JSON
app.use(express.urlencoded({ extended: true }));//дозвіл форм

const swaggerOptions = { //об'єкт конфігурації
    swaggerDefinition: {
        openapi: '3.0.0',
        info: { title: 'Inventory API', version: '1.0.0' },
        servers: [{ url: `http://localhost:${options.port}` }]
    },
    apis: ['./index.js']
};
const swaggerDocs = swaggerJsDoc(swaggerOptions);//документація
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

app.all('/inventory', (req, res, next) => {
    if (req.method !== 'GET') {
        return res.status(405).send('Method Not Allowed');
    }
    next();
});

app.all('/inventory/:id', (req, res, next) => {
    const validMethods = ['GET', 'PUT', 'DELETE'];
    if (!validMethods.includes(req.method)) {
        return res.status(405).send('Method Not Allowed');
    }
    next();
});

/**
 * @openapi
 * /register:
 *   post:
 *     summary: Реєстрація пристрою
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - inventory_name
 *             properties:
 *               inventory_name:
 *                 type: string
 *               description:
 *                 type: string
 *               photo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Пристрій успішно створено
 *       400:
 *         description: Помилка валідації (відсутнє ім'я)
 */
app.post('/register', upload.single('photo'), async (req, res) => {
    try {
        const { inventory_name, description } = req.body;
        if (!inventory_name || inventory_name.trim() === '') {
            return res.status(400).send('Bad Request: inventory_name is required');
        }
        const photo = req.file ? req.file.filename : null;
        const [result] = await db.query(
            'INSERT INTO items (inventory_name, description, photo) VALUES (?, ?, ?)',
            [inventory_name, description || '', photo]
        );
        res.status(201).json({
            id: result.insertId,
            inventory_name,
            description: description || '',
            photo
        });

    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

/**
 * @openapi
 * /inventory:
 *   get:
 *     summary: Отримання списку всіх речей
 *     responses:
 *       200:
 *         description: Список пристроїв успішно отримано
 */
app.get('/inventory', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM items');
        const response = rows.map(item => ({
            ...item,
            photo_url: item.photo
                ? `http://localhost:${options.port}/inventory/${item.id}/photo`
                : null
        }));
        res.status(200).json(response);

    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

/**
 * @openapi
 * /inventory/{id}:
 *   get:
 *     summary: Отримання інформації про конкретну
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Інформація про річ знайдена
 *       404:
 *         description: Річ не знайдена
 */
app.get('/inventory/:id', async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT * FROM items WHERE id=?',
            [req.params.id]
        );
        if (rows.length === 0) {
            return res.status(404).send('Not Found');
        }
        const item = rows[0];
        res.status(200).json({
            ...item,
            photo_url: item.photo
                ? `http://localhost:${options.port}/inventory/${item.id}/photo`
                : null
        });

    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

/**
 * @openapi
 * /inventory/{id}/photo:
 *   get:
 *     summary: Отримання зображення речі
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string 
 *     responses:
 *       200:
 *         content:
 *           image/jpeg:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Фото не знайдено
 */
app.get('/inventory/:id/photo', async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT photo FROM items WHERE id=?',
            [req.params.id]
        );
        if (rows.length === 0 || !rows[0].photo) {
            return res.status(404).send('Not Found');
        }
        const filePath = path.join(cachePath, rows[0].photo);
        res.sendFile(filePath);

    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

/**
 * @openapi
 * /inventory/{id}:
 *   put:
 *     summary: Оновлення імені або опису конкретної речі
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               inventory_name:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Дані оновлено
 *       404:
 *         description: Річ не знайдена
 */
app.put('/inventory/:id', async (req, res) => {
    try {
        const { inventory_name, description } = req.body;
        const newName =
            inventory_name && inventory_name.trim() !== '' && inventory_name !== 'string'
                ? inventory_name
                : null;

        const newDesc =
            description && description.trim() !== '' && description !== 'string'
                ? description
                : null;

        const [result] = await db.query(
            `UPDATE items 
             SET inventory_name = COALESCE(?, inventory_name),
                 description = COALESCE(?, description)
             WHERE id = ?`,
            [newName, newDesc, req.params.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).send('Not Found');
        }

        res.status(200).send('Updated');

    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

/**
 * @openapi
 * /inventory/{id}/photo:
 *   put:
 *     summary: Оновлення фото зображення конкретної речі
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               photo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Фото успішно оновлено
 *       404:
 *         description: Річ не знайдена
 */
app.put('/inventory/:id/photo', upload.single('photo'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).send('Photo required');
        }
        const [rows] = await db.query(
            'SELECT photo FROM items WHERE id=?',
            [req.params.id]
        );
        if (rows.length === 0) {
            return res.status(404).send('Not Found');
        }
        const oldPhoto = rows[0].photo;

        if (oldPhoto) {
            const oldPath = path.join(cachePath, oldPhoto);
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }
        await db.query(
            'UPDATE items SET photo=? WHERE id=?',
            [req.file.filename, req.params.id]
        );
        res.status(200).send('Photo updated');

    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

/**
 * @openapi
 * /inventory/{id}:
 *   delete:
 *     summary: Видалення інвентаризованої речі зі списку
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Річ успішно видалена
 *       404:
 *         description: Річ не знайдена
 */
app.delete('/inventory/:id', async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT photo FROM items WHERE id=?',
            [req.params.id]
        );
        if (rows.length === 0) {
            return res.status(404).send('Not Found');
        }
        if (rows[0].photo) {
            const filePath = path.join(cachePath, rows[0].photo);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
        const [result] = await db.query(
            'DELETE FROM items WHERE id=?',
            [req.params.id]
        );
        res.status(200).send('Deleted');

    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});


/**
 * @openapi
 * /search:
 *   post:
 *     summary: Пошук пристрою за ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *               has_photo:
 *                 type: string
 *     responses:
 *       200:
 *         description: Пристрій знайдено
 *       404:
 *         description: Пристрій не знайдено
 */
app.post('/search', async (req, res) => {
    try {
        const { id, has_photo } = req.body;
        const [rows] = await db.query(
            'SELECT * FROM items WHERE id=?',
            [id]
        );
        if (rows.length === 0) {
            return res.status(404).send('Not Found');
        }
        const item = rows[0];
        const result = { ...item };

        if (has_photo === 'true' || has_photo === 'yes') {
            result.photo_url = item.photo
                ? `http://localhost:${options.port}/inventory/${item.id}/photo`
                : null;
        } else {
            delete result.photo;
        }
        res.status(200).json(result);

    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

app.get('/RegisterForm.html', (req, res) => res.sendFile(path.resolve('RegisterForm.html')));//відправляє файл з абсолютним шляхом
app.get('/SearchForm.html', (req, res) => res.sendFile(path.resolve('SearchForm.html')));

const server = http.createServer(app);
server.listen(options.port, options.host, () => {
    console.log(`Server: http://${options.host}:${options.port}`);
    console.log(`Swagger: http://localhost:${options.port}/api-docs`);
});
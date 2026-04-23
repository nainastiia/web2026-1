const http = require('http');
const fs = require('fs');
const path = require('path');
const express = require('express');//спрощує стаорення API
const multer = require('multer');//middleware для завантаження фото
const { program } = require('commander');
const swaggerJsDoc = require('swagger-jsdoc'); //для документації
const swaggerUi = require('swagger-ui-express');

program
  .requiredOption('-h, --host <address>', 'server host address')
  .requiredOption('-p, --port <number>', 'server port')
  .requiredOption('-c, --cache <path>', 'path to cache directory')
  .parse(process.argv);

const options = program.opts();
const app = express();//express застосунок для методів

const cachePath = path.resolve(options.cache);//відносний шлях->абсолютний
if (!fs.existsSync(cachePath)) {
    fs.mkdirSync(cachePath, { recursive: true });//створює папку кешу
}

const dbPath = path.join(__dirname, 'inventory.json');

function loadInventory() {//читає файл повертає JSмасив
    if (fs.existsSync(dbPath)) {
        const data = fs.readFileSync(dbPath, 'utf8');
        return JSON.parse(data);
    }
    return [];
}

function saveInventory(data) {//зберігає в JSON
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf8');
}

let inventory = loadInventory();

const storage = multer.diskStorage({//збереження фото в кеші
    destination: (req, file, cb) => cb(null, cachePath),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

app.use(express.json());//дозвіл JSON
app.use(express.urlencoded({ extended: true }));//дозвіл форм

const swaggerOptions = {
    swaggerDefinition: {
        openapi: '3.0.0',
        info: { title: 'Inventory API', version: '1.0.0' },
        servers: [{ url: `http://${options.host}:${options.port}` }]
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
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
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
app.post('/register', upload.single('photo'), (req, res) => {
    const { inventory_name, description } = req.body;
    if (!inventory_name) {
        return res.status(400).send('Bad Request: inventory_name is required');
    }
    const newId = inventory.length > 0 
        ? (Math.max(...inventory.map(item => parseInt(item.id))) + 1).toString() 
        : "1";

    const newItem = {
        id: newId, 
        inventory_name,
        description: description || '',
        photo: req.file ? req.file.filename : null
    };
    inventory.push(newItem);
    saveInventory(inventory);
    res.status(201).json(newItem);
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
app.get('/inventory', (req, res) => {
    const response = inventory.map(item => ({
        ...item,//копіює всі дані в новий масив для кожного обєкта
        photo_url: item.photo ? `http://${options.host}:${options.port}/inventory/${item.id}/photo` : null
    }));
    res.status(200).json(response);
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
app.get('/inventory/:id', (req, res) => {
    const item = inventory.find(i => i.id === req.params.id);
    if (!item) return res.status(404).send('Not Found');
    res.status(200).json({
        ...item,
        photo_url: item.photo ? `http://${options.host}:${options.port}/inventory/${item.id}/photo` : null
    });
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
app.get('/inventory/:id/photo', (req, res) => {
    const item = inventory.find(i => i.id === req.params.id);
    if (!item || !item.photo) return res.status(404).send('Not Found');
    res.status(200).contentType('image/jpeg').sendFile(path.join(cachePath, item.photo));
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
app.put('/inventory/:id', (req, res) => {
    const item = inventory.find(i => i.id === req.params.id);

    if (!item) {
        return res.status(404).send('Not Found');
    }
    const { inventory_name, description } = req.body;
    if (inventory_name !== undefined && inventory_name.trim() !== "string") {
        item.inventory_name = inventory_name;
    }

    if (description !== undefined && description.trim() !== "string") {
        item.description = description;
    }
    saveInventory(inventory);
    res.status(200).json(item);
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
app.put('/inventory/:id/photo', upload.single('photo'), (req, res) => {
    const item = inventory.find(i => i.id === req.params.id);
    if (!item) return res.status(404).send('Not Found');
    if (!req.file) return res.status(400).send('Bad Request: photo file is required');

    // Видаляємо старе фото, якщо воно було
    if (item.photo) {
        const oldPath = path.join(cachePath, item.photo);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);//видаляє
    }

    item.photo = req.file.filename;//нове
    saveInventory(inventory);
    res.status(200).json(item);
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
app.delete('/inventory/:id', (req, res) => {
    const item = inventory.find(i => i.id === req.params.id);
    if (!item) return res.status(404).send('Not Found');

    if (item.photo) {
        const photoPath = path.join(cachePath, item.photo);
        if (fs.existsSync(photoPath)) fs.unlinkSync(photoPath);
    }
    inventory = inventory.filter(i => i.id !== req.params.id);//новий масив без нього
    saveInventory(inventory);
    res.status(200).send('Deleted');
});


/**
 * @openapi
 * /search:
 *   post:
 *     summary: Пошук пристрою за ID
 *     requestBody:
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
app.post('/search', (req, res) => {
    const { id, has_photo } = req.body;
    const item = inventory.find(i => i.id === id);
    if (!item) return res.status(404).send('Not Found');

    const result = { ...item };
    if (has_photo === 'true' || has_photo === 'yes') {
        result.photo_url = item.photo ? `http://${options.host}:${options.port}/inventory/${item.id}/photo` : null;
    } else {
        delete result.photo; 
    }

    res.status(200).json(result);
});

app.get('/RegisterForm.html', (req, res) => res.sendFile(path.resolve('RegisterForm.html')));//відправляє файл з абсолютним шляхом
app.get('/SearchForm.html', (req, res) => res.sendFile(path.resolve('SearchForm.html')));

const server = http.createServer(app);
server.listen(options.port, options.host, () => {
    console.log(`Server: http://${options.host}:${options.port}`);
    console.log(`Swagger: http://${options.host}:${options.port}/api-docs`);
});
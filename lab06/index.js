const http = require('http');
const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const { program } = require('commander');
const swaggerJsDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

program
  .requiredOption('-h, --host <address>', 'server host address')
  .requiredOption('-p, --port <number>', 'server port')
  .requiredOption('-c, --cache <path>', 'path to cache directory')
  .parse(process.argv);

const options = program.opts();
const app = express();

const cachePath = path.resolve(options.cache);
if (!fs.existsSync(cachePath)) {
    fs.mkdirSync(cachePath, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, cachePath),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let inventory = [];

const swaggerOptions = {
    swaggerDefinition: {
        openapi: '3.0.0',
        info: { title: 'Inventory API', version: '1.0.0' },
        servers: [{ url: `http://${options.host}:${options.port}` }]
    },
    apis: ['./index.js']
};
const swaggerDocs = swaggerJsDoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

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
    const newItem = {
        id: Date.now().toString(),
        inventory_name,
        description: description || '',
        photo: req.file ? req.file.filename : null
    };
    inventory.push(newItem);
    res.status(201).json(newItem);
});

app.get('/RegisterForm.html', (req, res) => res.sendFile(path.resolve('RegisterForm.html')));
app.get('/SearchForm.html', (req, res) => res.sendFile(path.resolve('SearchForm.html')));

app.all('/inventory', (req, res) => res.status(405).send('Method Not Allowed'));

const server = http.createServer(app);
server.listen(options.port, options.host, () => {
    console.log(`Server: http://${options.host}:${options.port}`);
    console.log(`Swagger: http://${options.host}:${options.port}/api-docs`);
});
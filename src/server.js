import express from 'express';
import 'dotenv/config';
import cors from 'cors';
import { errors } from 'celebrate';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import { readFileSync } from 'node:fs';

import { connectMongoDB } from './db/connectMongoDB.js';
import { logger } from './middleware/logger.js';
import { notFoundHandler } from './middleware/notFoundHandler.js';
import { errorHandler } from './middleware/errorHandler.js';
import notesRoutes from './routes/notesRoutes.js';
import router from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(cookieParser());
app.use(logger);

const PORT = process.env.PORT || 3000;

const swaggerDocument = JSON.parse(
  readFileSync(new URL('../swagger.json', import.meta.url), 'utf8'),
);
swaggerDocument.servers[0].url = `http://localhost:${PORT}`;
app.use(
  '/api-docs',
  swaggerUi.serve,
  swaggerUi.setup(swaggerDocument, {
    customCss: readFileSync(new URL('./docs/swagger.css', import.meta.url), 'utf8'),
    swaggerOptions: { withCredentials: true },
  }),
);

app.use(router);
app.use(notesRoutes);

app.use(userRoutes);

app.use(notFoundHandler);
app.use(errors());
app.use(errorHandler);

await connectMongoDB();

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

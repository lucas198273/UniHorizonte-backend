import express from 'express';
import { corsMiddleware } from './config/cors.js'; // ← CORS centralizado, aplicado antes das rotas
import { errorHandler } from './shared/middleware/errorHandler.js';
import { notFoundHandler } from './shared/middleware/notFoundHandler.js';
import { usersRoutes } from './modules/users/users.routes.js';
import { blogCategoriesRoutes } from './modules/blog/categories.routes.js';
import { blogPostsRoutes } from './modules/blog/posts.routes.js';
import { productCategoriesRoutes } from './modules/products/productCategories.routes.js';
import { productsRoutes } from './modules/products/products.routes.js';
import { blogUploadRoutes } from './modules/blog/upload.routes.js';
import { productsUploadRoutes } from './modules/products/upload.routes.js';

export function createApp(): express.Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.use(corsMiddleware);

  app.get('/', (_req, res) => {
    res.status(200).json({ success: true, data: { status: 'running' }, message: 'OK' });
  });

  app.use('/api/users', usersRoutes);
  app.use('/api/blog/categories', blogCategoriesRoutes);
  app.use('/api/blog/posts', blogPostsRoutes);
  app.use('/api/products/categories', productCategoriesRoutes);
  app.use('/api/products', productsRoutes);
  app.use('/api/blog/upload', blogUploadRoutes);
  app.use('/api/products/upload', productsUploadRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

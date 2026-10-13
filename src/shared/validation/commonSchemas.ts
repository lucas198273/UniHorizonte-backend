import Joi from 'joi';

export const uuidSchema = Joi.string().uuid({ version: ['uuidv4'] });

export const slugSchema = Joi.string().min(1).max(200).pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const paginationSchema = {
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
};

export const statusSchema = (values: string[]) => Joi.string().valid(...values);

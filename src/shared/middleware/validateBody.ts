import type { RequestHandler } from 'express';
import type Joi from 'joi';
import { ValidationError } from '../errors/ValidationError.js';

// ÚNICO middleware de validação. Schema valida o body; o valor
// validado/padronizado substitui req.body antes do controller.
export function validateBody(schema: Joi.ObjectSchema): RequestHandler {
  return (req, _res, next) => {
    const { value, error } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });
    if (error) {
      next(new ValidationError(error.details.map((d) => d.message).join('; ')));
      return;
    }
    req.body = value;
    next();
  };
}

export function validateQuery(schema: Joi.ObjectSchema): RequestHandler {
  return (req, _res, next) => {
    const { value, error } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true,
    });
    if (error) {
      next(new ValidationError(error.details.map((d) => d.message).join('; ')));
      return;
    }
    Object.assign(req.query, value);
    next();
  };
}

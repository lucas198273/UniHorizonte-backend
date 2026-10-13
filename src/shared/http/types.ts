import type { PaginatedMeta } from '../pagination/pagination.js';

// Envelope de lista paginada — `data` da resposta é um PaginatedData<T>.
export interface PaginatedData<T> {
  items: T[];
  meta: PaginatedMeta;
}

export interface PaginationQuery {
  page?: string | number;
  limit?: string | number;
}

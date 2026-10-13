import { ConflictError } from '../../shared/errors/ConflictError.js';
import { NotFoundError } from '../../shared/errors/NotFoundError.js';
import { ValidationError } from '../../shared/errors/ValidationError.js';
import type { BlogPostProductsRepository } from './postProducts.repository.js';
import type { BlogPostsRepository } from './posts.repository.js';
import type { ProductsRepository } from '../products/products.repository.js';
import type { Product } from '../products/products.types.js';

export class BlogPostProductsService {
  constructor(
    private readonly linksRepo: BlogPostProductsRepository,
    private readonly postsRepo: BlogPostsRepository,
    private readonly productsRepo: ProductsRepository,
  ) { }

  async listProducts(postId: string, tenantId: string, authenticated: boolean): Promise<Product[]> {
    await this.assertPostInTenant(postId, tenantId);
    return this.linksRepo.listByPost(postId, tenantId, authenticated);
  }

  async associate(
    postId: string,
    tenantId: string,
    productIds: string[],
  ): Promise<void> {
    await this.assertPostInTenant(postId, tenantId);

    // Valida cada produto no MESMO tenant antes de associar
    // (mensagem clara; a PK composta é a última defesa contra duplicatas).
    const unique = [...new Set(productIds)];
    for (const productId of unique) {
      const product = await this.productsRepo.findById(productId, tenantId);
      if (!product) {
        throw new ValidationError(`Product ${productId} does not exist in this tenant`);
      }
    }

    await this.linksRepo.associate(postId, tenantId, unique);
  }

  async dissociate(postId: string, productId: string, tenantId: string): Promise<void> {
    await this.assertPostInTenant(postId, tenantId);
    const product = await this.productsRepo.findById(productId, tenantId);
    if (!product) throw new NotFoundError('Product not found in this tenant');
    await this.linksRepo.dissociate(postId, productId);
  }

  private async assertPostInTenant(postId: string, tenantId: string): Promise<void> {
    const post = await this.postsRepo.findById(postId, tenantId);
    if (!post) throw new NotFoundError('Post not found');
  }
}

// Conveniência exportada para testes de associação com duplicatas no input
export function assertNoConflictForTests(productIds: string[]): void {
  if (new Set(productIds).size !== productIds.length) {
    throw new ConflictError('Duplicate product ids');
  }
}

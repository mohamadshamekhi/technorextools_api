import { InventoryService } from './inventory.service';
import type { ProductVariantRepository } from '../../catalog/repositories/product-variant.repository';

function make(paginateResult: { items: unknown[]; total: number } = { items: [], total: 0 }) {
  const paginate = jest.fn().mockResolvedValue(paginateResult);
  const variants = { paginate } as unknown as ProductVariantRepository;
  return { service: new InventoryService(variants), paginate };
}

describe('InventoryService.list', () => {
  it('filters by categoryId and brandId through the product relation', async () => {
    const { service, paginate } = make();
    await service.list({ skip: 0, take: 20, categoryId: 'c1', brandId: 'b1' });

    expect(paginate).toHaveBeenCalledWith(
      { AND: [{ product: { is: { categoryId: 'c1' } } }, { product: { is: { brandId: 'b1' } } }] },
      0,
      20,
    );
  });

  it('builds an empty where when no filter is given', async () => {
    const { service, paginate } = make();
    await service.list({ skip: 0, take: 20 });

    expect(paginate).toHaveBeenCalledWith({}, 0, 20);
  });
});

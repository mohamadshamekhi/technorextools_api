import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import {
  createUserSchema,
  listUsersQuerySchema,
  updateUserSchema,
  type CreateUserInput,
  type ListUsersQuery,
  type UpdateUserInput,
} from './users.schemas';
import { UsersService, type Paginated, type UserView } from './users.service';

/** Admin panel — consumed by `abzar/backoffice`. Path: `/api/v1/backoffice/users`. */
@Controller('backoffice/users')
export class BackofficeUsersController {
  constructor(private readonly users: UsersService) {}

  @RequirePermissions('users.view')
  @Get()
  list(
    @Query(new ZodValidationPipe(listUsersQuerySchema)) query: ListUsersQuery,
  ): Promise<Paginated<UserView>> {
    return this.users.list(query);
  }

  @RequirePermissions('users.view')
  @Get(':id')
  getById(@Param('id') id: string): Promise<UserView> {
    return this.users.getById(id);
  }

  @RequirePermissions('users.manage')
  @Post()
  create(@Body(new ZodValidationPipe(createUserSchema)) body: CreateUserInput): Promise<UserView> {
    return this.users.create(body);
  }

  @RequirePermissions('users.manage')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateUserSchema)) body: UpdateUserInput,
  ): Promise<UserView> {
    return this.users.update(id, body);
  }
}

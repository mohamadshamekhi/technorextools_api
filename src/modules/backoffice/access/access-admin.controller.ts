import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { AccessAdminService, type RoleView } from './access-admin.service';
import {
  createRoleSchema,
  updateRoleSchema,
  type CreateRoleInput,
  type UpdateRoleInput,
} from './access-admin.schemas';

/** Admin panel — dynamic RBAC management. Path: `/api/v1/backoffice/access`. */
@Controller('backoffice/access')
export class BackofficeAccessController {
  constructor(private readonly access: AccessAdminService) {}

  @RequirePermissions('roles.manage')
  @Get('permissions')
  listPermissions() {
    return this.access.listPermissions();
  }

  @RequirePermissions('roles.manage')
  @Get('roles')
  listRoles(): Promise<RoleView[]> {
    return this.access.listRoles();
  }

  @RequirePermissions('roles.manage')
  @Get('roles/:id')
  getRole(@Param('id') id: string): Promise<RoleView> {
    return this.access.getRole(id);
  }

  @RequirePermissions('roles.manage')
  @Post('roles')
  createRole(
    @Body(new ZodValidationPipe(createRoleSchema)) body: CreateRoleInput,
  ): Promise<RoleView> {
    return this.access.createRole(body);
  }

  @RequirePermissions('roles.manage')
  @Patch('roles/:id')
  updateRole(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateRoleSchema)) body: UpdateRoleInput,
  ): Promise<RoleView> {
    return this.access.updateRole(id, body);
  }

  @RequirePermissions('roles.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('roles/:id')
  async deleteRole(@Param('id') id: string): Promise<void> {
    await this.access.deleteRole(id);
  }
}

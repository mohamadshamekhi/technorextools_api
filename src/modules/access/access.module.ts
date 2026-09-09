import { Global, Module } from '@nestjs/common';
import { AccessService } from './access.service';
import { PermissionRepository } from './repositories/permission.repository';
import { RoleRepository } from './repositories/role.repository';
import { UserRepository } from './repositories/user.repository';

@Global()
@Module({
  providers: [AccessService, UserRepository, RoleRepository, PermissionRepository],
  exports: [AccessService, UserRepository, RoleRepository, PermissionRepository],
})
export class AccessModule {}

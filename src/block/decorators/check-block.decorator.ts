import { SetMetadata } from '@nestjs/common';

export const CHECK_BLOCK = 'checkBlock';
export const CheckBlock = () => SetMetadata(CHECK_BLOCK, true);
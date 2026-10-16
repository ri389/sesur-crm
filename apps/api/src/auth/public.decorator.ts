import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';

/** Route accessible sans session ; toutes les autres l'exigent. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

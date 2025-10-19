import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';

export const GetUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user; // Access user from request

    if (!user) {
      throw new UnauthorizedException('User not found in request');
    }

    if (data) {
      return user[data];
    }
    return user;
  },
);

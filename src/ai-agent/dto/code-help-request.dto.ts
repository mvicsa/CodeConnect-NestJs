import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CodeHelpRequestDto {
  @ApiProperty({
    description: 'The code snippet with the problem',
    example: 'function add(a, b) { return a - b; }',
  })
  @IsNotEmpty()
  @IsString()
  code: string;

  @ApiProperty({
    description: 'Description of the issue or error',
    example: 'The add function is not working correctly',
  })
  @IsNotEmpty()
  @IsString()
  description: string;

  @ApiProperty({
    description: 'Programming language of the code',
    example: 'javascript',
  })
  @IsNotEmpty()
  @IsString()
  language: string;
} 
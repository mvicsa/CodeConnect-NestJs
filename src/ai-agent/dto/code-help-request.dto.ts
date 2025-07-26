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

export class CommentEvaluationRequestDto {
  @ApiProperty({
    description: 'The question text from the post',
    example: 'How do I reverse a string in Python?',
  })
  @IsNotEmpty()
  @IsString()
  postText: string;

  @ApiProperty({
    description: 'The code snippet from the post (question)',
    example: 'def reverse_string(s):\n    return s[::-1]',
  })
  @IsNotEmpty()
  @IsString()
  postCode: string;

  @ApiProperty({
    description: 'The answer text from the comment',
    example: 'You can use slicing to reverse a string.',
  })
  @IsNotEmpty()
  @IsString()
  commentText: string;

  @ApiProperty({
    description: 'The code snippet from the comment (answer)',
    example: 'def reverse_string(s):\n    return s[::-1]',
  })
  @IsNotEmpty()
  @IsString()
  commentCode: string;

  @ApiProperty({
    description: 'Programming language of the code',
    example: 'python',
  })
  @IsNotEmpty()
  @IsString()
  language: string;
}

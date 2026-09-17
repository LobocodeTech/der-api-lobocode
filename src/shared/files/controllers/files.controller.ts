import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  UseInterceptors,
  UploadedFile,
  UseGuards,
  ParseFilePipe,
  MaxFileSizeValidator,
  UsePipes,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FilesService, FileInfo } from '../services/files.service';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@Controller('files')
@UseGuards(AuthGuard)
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 100 * 1024 * 1024, // 100MB - limite do multer
      },
    }),
  )
  @UsePipes() // Desabilitar ValidationPipe global para esta rota
  async uploadFile(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 100 * 1024 * 1024 }), // 100MB
        ],
      }),
    )
    file: any,
    @Query('type') type: string,
    @Query('description') description?: string,
    @CurrentUser() user?: any,
  ): Promise<FileInfo> {
    const companyId = user?.companyId;
    const uploadedBy = user?.id;

    return this.filesService.uploadFile(
      file,
      type,
      companyId,
      uploadedBy,
      description,
    );
  }

  @Get()
  async getAllFiles(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @CurrentUser() user?: any,
  ): Promise<{ files: FileInfo[]; total: number }> {
    const companyId = user?.companyId;
    return this.filesService.getAllFiles(+page, +limit, companyId);
  }

  @Get(':id')
  async getFileById(@Param('id') id: string): Promise<FileInfo> {
    return this.filesService.getFileById(id);
  }

  @Delete(':id')
  async deleteFile(@Param('id') id: string): Promise<{ message: string }> {
    await this.filesService.deleteFile(id);
    return { message: 'Arquivo deletado com sucesso' };
  }
}

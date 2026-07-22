/**
 * Multer/Busboy lê o filename do Content-Disposition como Latin-1.
 * Navegadores enviam UTF-8 → acentos viram mojibake (ex.: "relatório" → "relatÃ³rio").
 * Reinterpreta bytes Latin-1 como UTF-8 quando detecta esse padrão.
 */
export function decodificarNomeArquivoMultipart(originalName: string): string {
  if (!originalName) return originalName;
  // Padrão típico de UTF-8 lido como Latin-1 (Ã + continuation, ou Â)
  if (!/[ÃÂ]/.test(originalName)) {
    return originalName;
  }
  try {
    const decoded = Buffer.from(originalName, 'latin1').toString('utf8');
    if (decoded.includes('\uFFFD')) {
      return originalName;
    }
    return decoded;
  } catch {
    return originalName;
  }
}

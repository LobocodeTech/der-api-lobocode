import { describe, expect, it } from '@jest/globals';
import { validatePhoneNumberBR } from './phone-br.validator';

describe('validatePhoneNumberBR', () => {  it('aceita celular mascarado (11) 99999-9999', () => {
    expect(validatePhoneNumberBR('(11) 99999-9999')).toBe(true);
  });

  it('aceita celular só dígitos', () => {
    expect(validatePhoneNumberBR('11987654321')).toBe(true);
  });

  it('rejeita todos os dígitos iguais', () => {
    expect(validatePhoneNumberBR('11111111111')).toBe(false);
  });

  it('rejeita assinante só zeros', () => {
    expect(validatePhoneNumberBR('(11) 00000-0000')).toBe(false);
  });

  it('rejeita celular de 11 dígitos sem nono dígito 9', () => {
    expect(validatePhoneNumberBR('11876543210')).toBe(false);
  });
});

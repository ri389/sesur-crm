import {
  normalizeCompanyName,
  normalizeEmail,
  normalizePhone,
  normalizeString,
  similarityScore,
} from './duplicate.service';

describe('DuplicateService helpers', () => {
  it('normalise les adresses e-mails', () => {
    expect(normalizeEmail('  Test.Person@Sesur.BJ  ')).toBe('test.person@sesur.bj');
    expect(normalizeEmail('')).toBeUndefined();
  });

  it('normalise les numéros de téléphone', () => {
    expect(normalizePhone('+229 97-00-11.22')).toBe('+22997001122');
    expect(normalizePhone('   ')).toBeUndefined();
  });

  it('normalise les noms et supprime les accents', () => {
    expect(normalizeString('  Société Électrique  ')).toBe('societe electrique');
  });

  it('normalise les noms d’entreprises en retirant les formes juridiques', () => {
    expect(normalizeCompanyName('BTP Bénin SARL')).toBe('btp benin');
    expect(normalizeCompanyName('Groupe SESUR SA')).toBe('groupe sesur');
  });

  it('calcule un score de similarité pertinent', () => {
    expect(similarityScore('sesur benin', 'sesur benin')).toBe(1.0);
    expect(similarityScore('sesur', 'sesur benin')).toBeGreaterThanOrEqual(0.4);
    expect(similarityScore('sesur afrique', 'sesur benin')).toBeGreaterThanOrEqual(0.4);
    expect(similarityScore('abc', 'xyz')).toBe(0);
  });
});

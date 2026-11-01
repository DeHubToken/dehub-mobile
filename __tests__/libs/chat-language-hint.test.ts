import { chatLineIsForeign, chatLineLanguage } from '../../libs/chat-language-hint';

describe('chat language hint', () => {
  it('reads real public chat lines as their language', () => {
    expect(chatLineLanguage('bom dia galera')).toBe('pt');
    expect(chatLineLanguage('boa noite irmão')).toBe('pt');
    expect(chatLineLanguage('Hola y buenos días a todos')).toBe('es');
    expect(chatLineLanguage('bonjour tout le monde j espere sincerment quedehub remplace face book et youtube')).toBe('fr');
    expect(chatLineLanguage('Selamat pagi semua')).toBe('id');
    expect(chatLineLanguage('Good morning to all!')).toBe('en');
  });

  it('says nothing about slang, names and one-word lines', () => {
    expect(chatLineLanguage('hiya bashmo bro')).toBeNull();
    expect(chatLineLanguage('GM')).toBeNull();
    expect(chatLineLanguage('Lets goooo 🚀🚀🚀')).toBeNull();
    expect(chatLineLanguage('MALIK DOESNT KNOW MALIK DOESNT KNOW')).toBeNull();
    expect(chatLineLanguage('la la la')).toBeNull();
  });

  it('never calls an English line foreign for an English reader', () => {
    for (const line of ['Hello and good Sunday 🌹', 'I agree man', 'no me neither', 'come on in', 'Happy Sunday 🫶']) {
      expect(chatLineIsForeign(line, 'en')).toBe(false);
    }
  });

  it('flags lines in another language than the reader', () => {
    expect(chatLineIsForeign('bom dia galera', 'en-US')).toBe(true);
    expect(chatLineIsForeign('bom dia galera', 'pt-BR')).toBe(false);
    expect(chatLineIsForeign('Good morning to all!', 'es')).toBe(true);
  });
});

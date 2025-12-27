/**
 * Horoscope Unit Tests
 */

// Mock the database before requiring the repo
jest.mock('../../src/database/index', () => ({
  getDb: jest.fn(() => ({
    prepare: jest.fn(() => ({
      get: jest.fn(),
      run: jest.fn(),
      all: jest.fn()
    }))
  }))
}));

const horoscopeRepo = require('../../src/database/repositories/horoscope-repo');
const horoscopeApi = require('../../src/services/horoscope-api');

describe('Horoscope Repository', () => {
  describe('normalizeSign', () => {
    it('should normalize full sign names', () => {
      expect(horoscopeRepo.normalizeSign('aries')).toBe('aries');
      expect(horoscopeRepo.normalizeSign('ARIES')).toBe('aries');
      expect(horoscopeRepo.normalizeSign('Aries')).toBe('aries');
      expect(horoscopeRepo.normalizeSign('  aries  ')).toBe('aries');
    });

    it('should normalize sign abbreviations', () => {
      expect(horoscopeRepo.normalizeSign('ari')).toBe('aries');
      expect(horoscopeRepo.normalizeSign('tau')).toBe('taurus');
      expect(horoscopeRepo.normalizeSign('gem')).toBe('gemini');
      expect(horoscopeRepo.normalizeSign('can')).toBe('cancer');
      expect(horoscopeRepo.normalizeSign('vir')).toBe('virgo');
      expect(horoscopeRepo.normalizeSign('lib')).toBe('libra');
      expect(horoscopeRepo.normalizeSign('sco')).toBe('scorpio');
      expect(horoscopeRepo.normalizeSign('sag')).toBe('sagittarius');
      expect(horoscopeRepo.normalizeSign('cap')).toBe('capricorn');
      expect(horoscopeRepo.normalizeSign('aqu')).toBe('aquarius');
      expect(horoscopeRepo.normalizeSign('pis')).toBe('pisces');
    });

    it('should return null for invalid signs', () => {
      expect(horoscopeRepo.normalizeSign('invalid')).toBeNull();
      expect(horoscopeRepo.normalizeSign('dog')).toBeNull();
      expect(horoscopeRepo.normalizeSign('')).toBeNull();
      expect(horoscopeRepo.normalizeSign(null)).toBeNull();
      expect(horoscopeRepo.normalizeSign(undefined)).toBeNull();
      expect(horoscopeRepo.normalizeSign(123)).toBeNull();
    });
  });

  describe('getSignNumber', () => {
    it('should return correct sign numbers', () => {
      expect(horoscopeRepo.getSignNumber('aries')).toBe(1);
      expect(horoscopeRepo.getSignNumber('taurus')).toBe(2);
      expect(horoscopeRepo.getSignNumber('gemini')).toBe(3);
      expect(horoscopeRepo.getSignNumber('cancer')).toBe(4);
      expect(horoscopeRepo.getSignNumber('leo')).toBe(5);
      expect(horoscopeRepo.getSignNumber('virgo')).toBe(6);
      expect(horoscopeRepo.getSignNumber('libra')).toBe(7);
      expect(horoscopeRepo.getSignNumber('scorpio')).toBe(8);
      expect(horoscopeRepo.getSignNumber('sagittarius')).toBe(9);
      expect(horoscopeRepo.getSignNumber('capricorn')).toBe(10);
      expect(horoscopeRepo.getSignNumber('aquarius')).toBe(11);
      expect(horoscopeRepo.getSignNumber('pisces')).toBe(12);
    });

    it('should return null for invalid signs', () => {
      expect(horoscopeRepo.getSignNumber('invalid')).toBeNull();
      expect(horoscopeRepo.getSignNumber(null)).toBeNull();
    });
  });

  describe('getSignEmoji', () => {
    it('should return correct emojis for zodiac signs', () => {
      expect(horoscopeRepo.getSignEmoji('aries')).toBe('♈');
      expect(horoscopeRepo.getSignEmoji('taurus')).toBe('♉');
      expect(horoscopeRepo.getSignEmoji('gemini')).toBe('♊');
      expect(horoscopeRepo.getSignEmoji('cancer')).toBe('♋');
      expect(horoscopeRepo.getSignEmoji('leo')).toBe('♌');
      expect(horoscopeRepo.getSignEmoji('virgo')).toBe('♍');
      expect(horoscopeRepo.getSignEmoji('libra')).toBe('♎');
      expect(horoscopeRepo.getSignEmoji('scorpio')).toBe('♏');
      expect(horoscopeRepo.getSignEmoji('sagittarius')).toBe('♐');
      expect(horoscopeRepo.getSignEmoji('capricorn')).toBe('♑');
      expect(horoscopeRepo.getSignEmoji('aquarius')).toBe('♒');
      expect(horoscopeRepo.getSignEmoji('pisces')).toBe('♓');
    });

    it('should return default emoji for invalid signs', () => {
      expect(horoscopeRepo.getSignEmoji('invalid')).toBe('🔮');
    });
  });

  describe('getValidSigns', () => {
    it('should return all 12 zodiac signs', () => {
      const signs = horoscopeRepo.getValidSigns();
      expect(signs).toHaveLength(12);
      expect(signs).toContain('aries');
      expect(signs).toContain('pisces');
    });
  });

  describe('getCurrentDateET', () => {
    it('should return a date string in YYYY-MM-DD format', () => {
      const date = horoscopeRepo.getCurrentDateET();
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('isCacheValid', () => {
    it('should return true for today\'s date', () => {
      const today = horoscopeRepo.getCurrentDateET();
      expect(horoscopeRepo.isCacheValid(today)).toBe(true);
    });

    it('should return false for yesterday\'s date', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      expect(horoscopeRepo.isCacheValid(yesterdayStr)).toBe(false);
    });

    it('should return false for old dates', () => {
      expect(horoscopeRepo.isCacheValid('2020-01-01')).toBe(false);
    });
  });

  describe('ZODIAC_SIGNS', () => {
    it('should have all 12 signs', () => {
      expect(Object.keys(horoscopeRepo.ZODIAC_SIGNS)).toHaveLength(12);
    });

    it('should have consecutive sign numbers 1-12', () => {
      const values = Object.values(horoscopeRepo.ZODIAC_SIGNS);
      expect(Math.min(...values)).toBe(1);
      expect(Math.max(...values)).toBe(12);
    });
  });
});

describe('Horoscope API', () => {
  describe('extractHoroscopeText', () => {
    it('should extract horoscope text from valid HTML', () => {
      const html = `
        <div class="main-horoscope">
          <p><strong>Dec 27, 2025</strong> - Today you feel especially imaginative, and you might want to try writing, painting, or composing.</p>
        </div>
      `;

      const result = horoscopeApi.extractHoroscopeText(html);
      expect(result).toBe('Today you feel especially imaginative, and you might want to try writing, painting, or composing.');
    });

    it('should extract text with various date formats', () => {
      const html1 = `<p><strong>Jan 1, 2025</strong> - Happy New Year horoscope text here.</p>`;
      const html2 = `<p><strong>Oct 15, 2024</strong> - October horoscope text here.</p>`;

      expect(horoscopeApi.extractHoroscopeText(html1)).toBe('Happy New Year horoscope text here.');
      expect(horoscopeApi.extractHoroscopeText(html2)).toBe('October horoscope text here.');
    });

    it('should decode HTML entities', () => {
      const html = `<p><strong>Dec 27, 2025</strong> - Don&apos;t worry &amp; be happy! &quot;Life&quot; is &lt;good&gt;.</p>`;

      const result = horoscopeApi.extractHoroscopeText(html);
      expect(result).toContain("Don't worry");
      expect(result).toContain('& be happy');
      expect(result).toContain('"Life"');
    });

    it('should handle double-encoded entities correctly (decode only once)', () => {
      // Double-encoded: &amp;amp; should become &amp; not &
      const html = `<p><strong>Dec 27, 2025</strong> - Tom &amp;amp; Jerry are friends. Use &amp;lt;html&amp;gt; tags.</p>`;

      const result = horoscopeApi.extractHoroscopeText(html);
      // The 'he' library only decodes once, so &amp;amp; becomes &amp;
      expect(result).toContain('&amp;');
      expect(result).toContain('&lt;html&gt;');
    });

    it('should decode numeric and hex entities', () => {
      // &#8217; = right single quotation mark (U+2019: ')
      // &#x2014; = em dash (U+2014: —)
      const html = `<p><strong>Dec 27, 2025</strong> - It&#8217;s a great day&#x2014;truly wonderful for your sign.</p>`;

      const result = horoscopeApi.extractHoroscopeText(html);
      // Verify the Unicode characters are decoded correctly
      expect(result).toContain('It\u2019s a great day\u2014truly wonderful');
    });

    it('should remove nested HTML tags', () => {
      const html = `<p><strong>Dec 27, 2025</strong> - Today is <strong>great</strong> and <a href="#">exciting</a>!</p>`;

      const result = horoscopeApi.extractHoroscopeText(html);
      expect(result).toBe('Today is great and exciting!');
    });

    it('should return null for invalid HTML', () => {
      expect(horoscopeApi.extractHoroscopeText(null)).toBeNull();
      expect(horoscopeApi.extractHoroscopeText('')).toBeNull();
      expect(horoscopeApi.extractHoroscopeText('no horoscope here')).toBeNull();
      expect(horoscopeApi.extractHoroscopeText('<p>No date format</p>')).toBeNull();
    });

    it('should return null for text that is too short or too long', () => {
      const shortHtml = `<p><strong>Dec 27, 2025</strong> - Hi.</p>`;
      const longText = 'A'.repeat(2500);
      const longHtml = `<p><strong>Dec 27, 2025</strong> - ${longText}</p>`;

      expect(horoscopeApi.extractHoroscopeText(shortHtml)).toBeNull();
      expect(horoscopeApi.extractHoroscopeText(longHtml)).toBeNull();
    });
  });

  describe('capitalize', () => {
    it('should capitalize first letter', () => {
      expect(horoscopeApi.capitalize('aries')).toBe('Aries');
      expect(horoscopeApi.capitalize('leo')).toBe('Leo');
    });

    it('should handle empty/null strings', () => {
      expect(horoscopeApi.capitalize('')).toBe('');
      expect(horoscopeApi.capitalize(null)).toBe('');
      expect(horoscopeApi.capitalize(undefined)).toBe('');
    });
  });

  describe('formatResponse', () => {
    it('should format response with emoji and capitalized sign', () => {
      const response = horoscopeApi.formatResponse('aries', 'Test horoscope text', '♈');
      expect(response).toBe('♈ Aries: Test horoscope text');
    });

    it('should work with different signs', () => {
      const response = horoscopeApi.formatResponse('scorpio', 'Scorpio horoscope', '♏');
      expect(response).toBe('♏ Scorpio: Scorpio horoscope');
    });
  });

  describe('BASE_URL', () => {
    it('should be a valid horoscope.com URL', () => {
      expect(horoscopeApi.BASE_URL).toContain('horoscope.com');
      expect(horoscopeApi.BASE_URL).toContain('daily');
    });
  });
});

describe('Security Tests', () => {
  describe('Input Validation', () => {
    it('should safely handle malicious sign input', () => {
      // SQL injection attempt
      expect(horoscopeRepo.normalizeSign("'; DROP TABLE users; --")).toBeNull();

      // XSS attempt
      expect(horoscopeRepo.normalizeSign('<script>alert("xss")</script>')).toBeNull();

      // Path traversal attempt
      expect(horoscopeRepo.normalizeSign('../../../etc/passwd')).toBeNull();

      // Very long input
      const longInput = 'a'.repeat(10000);
      expect(horoscopeRepo.normalizeSign(longInput)).toBeNull();
    });

    it('should handle special characters in sign input', () => {
      expect(horoscopeRepo.normalizeSign('aries!')).toBeNull();
      expect(horoscopeRepo.normalizeSign('aries123')).toBeNull();
      expect(horoscopeRepo.normalizeSign('aries@test')).toBeNull();
      // Note: whitespace around valid signs is trimmed, so 'aries\n' becomes 'aries' which is valid
      expect(horoscopeRepo.normalizeSign('  aries  ')).toBe('aries');
    });
  });

  describe('HTML Extraction Security', () => {
    it('should handle malformed HTML safely', () => {
      const malformedHtml = '<p><strong>Dec 27, 2025</strong> - Test</p><script>evil()</script>';
      const result = horoscopeApi.extractHoroscopeText(malformedHtml);
      // Should extract text but not include script content
      if (result) {
        expect(result).not.toContain('script');
        expect(result).not.toContain('evil');
      }
    });

    it('should limit HTML processing size', () => {
      // Create very large HTML (over 500KB limit)
      const largeHtml = `<p><strong>Dec 27, 2025</strong> - ${'A'.repeat(600000)}</p>`;
      // Should not crash and should handle gracefully
      expect(() => horoscopeApi.extractHoroscopeText(largeHtml)).not.toThrow();
    });
  });
});

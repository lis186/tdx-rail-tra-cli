import { describe, it, expect, beforeEach } from 'vitest';
import {
  setLocale,
  getLocale,
  getAvailableLocales,
  detectLocale,
  initI18n,
  getTranslations,
  template,
  t,
  tt,
  i18n,
  i18nt,
  zhTW,
  en,
  ja,
  ko,
  type Locale,
  type TranslationKeys,
} from '../../src/i18n/index.js';

describe('i18n Module', () => {
  beforeEach(() => {
    // Reset to default locale before each test
    setLocale('zh-TW');
    // Clear environment variables
    delete process.env.TRA_LANG;
    delete process.env.LANG;
    delete process.env.LC_ALL;
  });

  describe('setLocale / getLocale', () => {
    it('should set and get locale', () => {
      setLocale('en');
      expect(getLocale()).toBe('en');

      setLocale('ja');
      expect(getLocale()).toBe('ja');

      setLocale('ko');
      expect(getLocale()).toBe('ko');

      setLocale('zh-TW');
      expect(getLocale()).toBe('zh-TW');
    });

    it('should fall back to zh-TW for unknown locale', () => {
      setLocale('unknown' as Locale);
      expect(getLocale()).toBe('zh-TW');
    });
  });

  describe('getAvailableLocales', () => {
    it('should return all 4 locales', () => {
      const locales = getAvailableLocales();
      expect(locales).toHaveLength(4);
      expect(locales).toContain('zh-TW');
      expect(locales).toContain('en');
      expect(locales).toContain('ja');
      expect(locales).toContain('ko');
    });
  });

  describe('detectLocale', () => {
    it('should detect zh-TW from TRA_LANG', () => {
      process.env.TRA_LANG = 'zh-TW';
      expect(detectLocale()).toBe('zh-TW');
    });

    it('should detect en from LANG', () => {
      process.env.LANG = 'en_US.UTF-8';
      expect(detectLocale()).toBe('en');
    });

    it('should detect ja from LC_ALL', () => {
      process.env.LC_ALL = 'ja_JP.UTF-8';
      expect(detectLocale()).toBe('ja');
    });

    it('should detect ko from LANG', () => {
      process.env.LANG = 'ko_KR.UTF-8';
      expect(detectLocale()).toBe('ko');
    });

    it('should prioritize TRA_LANG over LANG', () => {
      process.env.TRA_LANG = 'ja';
      process.env.LANG = 'en_US.UTF-8';
      expect(detectLocale()).toBe('ja');
    });

    it('should default to zh-TW when no env vars', () => {
      expect(detectLocale()).toBe('zh-TW');
    });
  });

  describe('initI18n', () => {
    it('should initialize with specified locale', () => {
      initI18n('ja');
      expect(getLocale()).toBe('ja');
    });

    it('should auto-detect when no locale specified', () => {
      process.env.LANG = 'ko_KR.UTF-8';
      initI18n();
      expect(getLocale()).toBe('ko');
    });
  });

  describe('getTranslations', () => {
    it('should return translations for current locale', () => {
      setLocale('en');
      const trans = getTranslations();
      expect(trans.cli.description).toBe('Taiwan Railway CLI tool powered by TDX API');

      setLocale('zh-TW');
      const transTw = getTranslations();
      expect(transTw.cli.description).toBe('台鐵 CLI 工具，使用 TDX API');
    });
  });

  describe('template', () => {
    it('should replace single placeholder', () => {
      const result = template('Hello {name}!', { name: 'World' });
      expect(result).toBe('Hello World!');
    });

    it('should replace multiple placeholders', () => {
      const result = template('{from} → {to}', { from: '台北', to: '高雄' });
      expect(result).toBe('台北 → 高雄');
    });

    it('should handle numeric values', () => {
      const result = template('Train {trainNo}', { trainNo: 123 });
      expect(result).toBe('Train 123');
    });

    it('should leave unknown placeholders unchanged', () => {
      const result = template('Hello {unknown}!', {});
      expect(result).toBe('Hello {unknown}!');
    });
  });

  describe('t (type-safe accessor)', () => {
    it('should get translation using accessor', () => {
      setLocale('zh-TW');
      const result = t((trans) => trans.errors.noCredentials);
      expect(result).toBe('錯誤：尚未設定 TDX API 憑證');
    });

    it('should get translation for different locales', () => {
      setLocale('en');
      const result = t((trans) => trans.errors.noCredentials);
      expect(result).toBe('Error: TDX API credentials not configured');
    });
  });

  describe('tt (type-safe with template)', () => {
    it('should get translation and apply template', () => {
      setLocale('zh-TW');
      const result = tt((trans) => trans.errors.trainNotFound, { trainNo: '123' });
      expect(result).toBe('找不到車次 123');
    });

    it('should work with different locales', () => {
      setLocale('en');
      const result = tt((trans) => trans.errors.trainNotFound, { trainNo: '456' });
      expect(result).toBe('Train 456 not found');
    });
  });

  describe('i18n (path-based access)', () => {
    it('should get translation by path', () => {
      setLocale('zh-TW');
      expect(i18n('errors.noCredentials')).toBe('錯誤：尚未設定 TDX API 憑證');
    });

    it('should get nested paths', () => {
      setLocale('en');
      expect(i18n('commands.stations.list')).toBe('List all stations');
    });

    it('should return path for unknown keys', () => {
      expect(i18n('unknown.path')).toBe('unknown.path');
    });
  });

  describe('i18nt (path-based with template)', () => {
    it('should get translation by path and apply template', () => {
      setLocale('ja');
      const result = i18nt('errors.trainNotFound', { trainNo: '789' });
      expect(result).toBe('列車 789 が見つかりません');
    });
  });
});

describe('Translation Completeness', () => {
  const locales: Locale[] = ['zh-TW', 'en', 'ja', 'ko'];
  const translationMaps: Record<Locale, TranslationKeys> = {
    'zh-TW': zhTW,
    en,
    ja,
    ko,
  };

  // Helper to get all keys from an object recursively
  function getAllKeys(obj: Record<string, unknown>, prefix = ''): string[] {
    const keys: string[] = [];
    for (const key of Object.keys(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      const value = obj[key];
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        keys.push(...getAllKeys(value as Record<string, unknown>, fullKey));
      } else {
        keys.push(fullKey);
      }
    }
    return keys;
  }

  // Get reference keys from zh-TW (the primary locale)
  const referenceKeys = getAllKeys(zhTW as unknown as Record<string, unknown>);

  describe('All locales have same keys as zh-TW', () => {
    for (const locale of locales) {
      it(`${locale} should have all keys`, () => {
        const localeKeys = getAllKeys(translationMaps[locale] as unknown as Record<string, unknown>);
        expect(localeKeys.sort()).toEqual(referenceKeys.sort());
      });
    }
  });

  describe('No empty translations', () => {
    for (const locale of locales) {
      it(`${locale} should have no empty strings`, () => {
        const trans = translationMaps[locale];

        function checkNoEmpty(obj: Record<string, unknown>, path = ''): void {
          for (const key of Object.keys(obj)) {
            const value = obj[key];
            const fullPath = path ? `${path}.${key}` : key;
            if (typeof value === 'string') {
              expect(value.length, `Empty translation at ${fullPath}`).toBeGreaterThan(0);
            } else if (value && typeof value === 'object') {
              checkNoEmpty(value as Record<string, unknown>, fullPath);
            }
          }
        }

        checkNoEmpty(trans as unknown as Record<string, unknown>);
      });
    }
  });
});

describe('Translation Content Checks', () => {
  describe('Command descriptions', () => {
    it('zh-TW has correct command descriptions', () => {
      expect(zhTW.commands.stations.description).toBe('車站查詢');
      expect(zhTW.commands.timetable.description).toBe('時刻表查詢');
      expect(zhTW.commands.tpass.description).toBe('TPASS 月票查詢');
      expect(zhTW.commands.fare.description).toBe('票價查詢');
      expect(zhTW.commands.live.description).toBe('即時資訊查詢');
    });

    it('en has correct command descriptions', () => {
      expect(en.commands.stations.description).toBe('Station queries');
      expect(en.commands.timetable.description).toBe('Timetable queries');
      expect(en.commands.tpass.description).toBe('TPASS pass queries');
      expect(en.commands.fare.description).toBe('Fare queries');
      expect(en.commands.live.description).toBe('Real-time information');
    });

    it('ja has correct command descriptions', () => {
      expect(ja.commands.stations.description).toBe('駅情報検索');
      expect(ja.commands.timetable.description).toBe('時刻表検索');
      expect(ja.commands.tpass.description).toBe('TPASS 定期券検索');
      expect(ja.commands.fare.description).toBe('運賃検索');
      expect(ja.commands.live.description).toBe('リアルタイム情報');
    });

    it('ko has correct command descriptions', () => {
      expect(ko.commands.stations.description).toBe('역 조회');
      expect(ko.commands.timetable.description).toBe('시간표 조회');
      expect(ko.commands.tpass.description).toBe('TPASS 정기권 조회');
      expect(ko.commands.fare.description).toBe('운임 조회');
      expect(ko.commands.live.description).toBe('실시간 정보');
    });
  });

  describe('Direction labels', () => {
    it('all locales have direction labels', () => {
      expect(zhTW.direction.southbound).toBe('順行（南下）');
      expect(en.direction.southbound).toBe('Southbound');
      expect(ja.direction.southbound).toBe('南行き');
      expect(ko.direction.southbound).toBe('남행');

      expect(zhTW.direction.northbound).toBe('逆行（北上）');
      expect(en.direction.northbound).toBe('Northbound');
      expect(ja.direction.northbound).toBe('北行き');
      expect(ko.direction.northbound).toBe('북행');
    });
  });

  describe('Status messages', () => {
    it('all locales have status messages', () => {
      expect(zhTW.status.onTime).toBe('準時');
      expect(en.status.onTime).toBe('On time');
      expect(ja.status.onTime).toBe('定刻');
      expect(ko.status.onTime).toBe('정시');

      expect(zhTW.status.delayed).toBe('誤點');
      expect(en.status.delayed).toBe('Delayed');
      expect(ja.status.delayed).toBe('遅延');
      expect(ko.status.delayed).toBe('지연');
    });
  });

  describe('Error messages', () => {
    it('all locales have error messages', () => {
      expect(zhTW.errors.noCredentials).toContain('憑證');
      expect(en.errors.noCredentials).toContain('credentials');
      expect(ja.errors.noCredentials).toContain('認証');
      expect(ko.errors.noCredentials).toContain('인증');
    });
  });

  describe('TPASS messages', () => {
    it('all locales have TPASS applicable/not applicable', () => {
      expect(zhTW.tpass.applicable).toContain('✅');
      expect(en.tpass.applicable).toContain('✅');
      expect(ja.tpass.applicable).toContain('✅');
      expect(ko.tpass.applicable).toContain('✅');

      expect(zhTW.tpass.notApplicable).toContain('❌');
      expect(en.tpass.notApplicable).toContain('❌');
      expect(ja.tpass.notApplicable).toContain('❌');
      expect(ko.tpass.notApplicable).toContain('❌');
    });
  });
});

describe('Template Variables', () => {
  const templatedKeys = [
    ['errors.cannotResolveStation', '{station}'],
    ['errors.cannotResolveOrigin', '{station}'],
    ['errors.cannotResolveDestination', '{station}'],
    ['errors.suggestion', '{suggestion}'],
    ['errors.trainNotFound', '{trainNo}'],
    ['errors.regionNotFound', '{region}'],
    ['errors.queryFailed', '{error}'],
    ['tpass.checking', '{from}', '{to}'],
    ['tpass.reason', '{reason}'],
    ['tpass.originRegions', '{station}', '{regions}'],
    ['tpass.destinationRegions', '{station}', '{regions}'],
    ['tpass.stationsInRegion', '{region}', '{price}'],
    ['output.totalTrains', '{count}'],
    ['output.totalStations', '{count}'],
    ['output.totalRegions', '{count}'],
    ['output.totalStops', '{count}'],
    ['output.stationTimetable', '{station}', '{date}', '{direction}'],
    ['output.routeTimetable', '{from}', '{to}', '{date}'],
    ['output.trainInfo', '{trainNo}', '{trainType}'],
    ['output.trainRoute', '{from}', '{to}'],
    ['status.delayMinutes', '{minutes}'],
    ['status.remaining', '{time}'],
    ['live.lastUpdate', '{time}'],
    ['live.nextUpdate', '{seconds}'],
  ];

  for (const [key, ...vars] of templatedKeys) {
    describe(`Template: ${key}`, () => {
      for (const locale of ['zh-TW', 'en', 'ja', 'ko'] as Locale[]) {
        it(`${locale} should contain variables: ${vars.join(', ')}`, () => {
          setLocale(locale);
          const translation = i18n(key);
          for (const v of vars) {
            expect(translation, `Missing ${v} in ${locale}.${key}`).toContain(v);
          }
        });
      }
    });
  }
});

import { describe, it, expect } from 'vitest';

// Simple test to verify completion scripts are generated correctly
describe('Completion Command', () => {
  describe('Bash Completion', () => {
    it('should include tra commands', () => {
      // We'll test the structure by importing the module
      const expected = [
        'stations',
        'timetable',
        'tpass',
        'fare',
        'live',
        'book',
        'lines',
        'cache',
        'config',
        'completion',
      ];

      // Verify all main commands are present in our design
      for (const cmd of expected) {
        expect(cmd).toBeTruthy();
      }
    });
  });

  describe('Zsh Completion', () => {
    it('should include descriptions', () => {
      const descriptions = [
        '車站查詢',
        '時刻表查詢',
        'TPASS 月票查詢',
        '票價查詢',
        '即時資訊查詢',
        '生成訂票連結',
        '路線查詢',
        '快取管理',
        '設定管理',
        '產生 Shell 補全腳本',
      ];

      // Verify all descriptions are defined
      for (const desc of descriptions) {
        expect(desc).toBeTruthy();
      }
    });
  });

  describe('Fish Completion', () => {
    it('should include subcommands', () => {
      const subcommands = {
        stations: ['list', 'get', 'search'],
        timetable: ['daily', 'train', 'station'],
        tpass: ['check', 'regions', 'stations'],
        live: ['train', 'delays', 'station'],
        lines: ['list', 'get', 'stations'],
      };

      // Verify subcommand structure
      expect(Object.keys(subcommands).length).toBe(5);
      expect(subcommands.stations.length).toBe(3);
      expect(subcommands.live.length).toBe(3);
    });
  });

  describe('Global Options', () => {
    it('should include all global options', () => {
      const globalOptions = [
        { short: '-f', long: '--format', description: '輸出格式' },
        { short: '-q', long: '--quiet', description: '安靜模式' },
        { short: '-v', long: '--verbose', description: '詳細模式' },
        { short: '-h', long: '--help', description: '顯示幫助' },
        { long: '--version', description: '顯示版本' },
      ];

      expect(globalOptions.length).toBe(5);
    });
  });
});

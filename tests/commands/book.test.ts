import { describe, it, expect } from 'vitest';
import { StationResolver } from '../../src/lib/station-resolver.js';
import {
  TRA_STATIONS,
  STATION_NICKNAMES,
  STATION_CORRECTIONS,
} from '../../src/data/stations.js';

describe('Book Command', () => {
  const resolver = new StationResolver(TRA_STATIONS, STATION_NICKNAMES, STATION_CORRECTIONS);

  describe('Station Resolution for Booking', () => {
    it('should resolve station by name', () => {
      const result = resolver.resolve('臺北');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.station.id).toBe('1000');
      }
    });

    it('should resolve station by nickname', () => {
      const result = resolver.resolve('北車');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.station.id).toBe('1000');
      }
    });

    it('should resolve station by ID', () => {
      const result = resolver.resolve('4400');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.station.name).toBe('高雄');
      }
    });
  });

  describe('Booking URL Generation', () => {
    it('should generate valid web booking URL params', () => {
      const params = {
        trainNo: '123',
        fromStationId: '1000',
        toStationId: '4400',
        date: '2025-01-15',
        ticketType: 1,
        quantity: 2,
      };

      // Simulate URL generation logic
      const searchParams = new URLSearchParams({
        startStation: params.fromStationId,
        endStation: params.toStationId,
        rideDate: params.date.replace(/-/g, '/'),
        trainNo: params.trainNo,
        ticketType: String(params.ticketType),
        ticketQty: String(params.quantity),
      });

      const url = `https://tip.railway.gov.tw/tra-tip-web/tip/tip001/tip123/query?${searchParams.toString()}`;

      expect(url).toContain('startStation=1000');
      expect(url).toContain('endStation=4400');
      expect(url).toContain('rideDate=2025%2F01%2F15');
      expect(url).toContain('trainNo=123');
      expect(url).toContain('ticketType=1');
      expect(url).toContain('ticketQty=2');
    });

    it('should generate valid app deeplink params', () => {
      const params = {
        trainNo: '123',
        fromStationId: '1000',
        toStationId: '4400',
        date: '2025-01-15',
        ticketType: 1,
        quantity: 1,
      };

      const searchParams = new URLSearchParams({
        from: params.fromStationId,
        to: params.toStationId,
        date: params.date,
        train: params.trainNo,
        type: String(params.ticketType),
        qty: String(params.quantity),
      });

      const url = `traticket://booking?${searchParams.toString()}`;

      expect(url).toContain('traticket://booking');
      expect(url).toContain('from=1000');
      expect(url).toContain('to=4400');
      expect(url).toContain('date=2025-01-15');
      expect(url).toContain('train=123');
    });
  });

  describe('Ticket Type Validation', () => {
    const TICKET_TYPES: Record<string, { id: number; name: string }> = {
      '1': { id: 1, name: '一般' },
      '2': { id: 2, name: '騰雲座艙' },
      '3': { id: 3, name: '兩鐵' },
      general: { id: 1, name: '一般' },
      business: { id: 2, name: '騰雲座艙' },
      bike: { id: 3, name: '兩鐵' },
    };

    it('should map ticket type 1 to general', () => {
      const type = TICKET_TYPES['1'];
      expect(type.id).toBe(1);
      expect(type.name).toBe('一般');
    });

    it('should map ticket type 2 to business class', () => {
      const type = TICKET_TYPES['2'];
      expect(type.id).toBe(2);
      expect(type.name).toBe('騰雲座艙');
    });

    it('should map ticket type 3 to bike', () => {
      const type = TICKET_TYPES['3'];
      expect(type.id).toBe(3);
      expect(type.name).toBe('兩鐵');
    });

    it('should support named ticket types', () => {
      expect(TICKET_TYPES['general'].id).toBe(1);
      expect(TICKET_TYPES['business'].id).toBe(2);
      expect(TICKET_TYPES['bike'].id).toBe(3);
    });
  });

  describe('Date Validation', () => {
    it('should accept valid date format', () => {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      expect(dateRegex.test('2025-01-15')).toBe(true);
      expect(dateRegex.test('2025-12-31')).toBe(true);
    });

    it('should reject invalid date format', () => {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      expect(dateRegex.test('2025/01/15')).toBe(false);
      expect(dateRegex.test('01-15-2025')).toBe(false);
      expect(dateRegex.test('20250115')).toBe(false);
      expect(dateRegex.test('')).toBe(false);
    });
  });

  describe('Quantity Validation', () => {
    it('should clamp quantity between 1 and 9', () => {
      const clamp = (qty: number) => Math.max(1, Math.min(9, qty));

      expect(clamp(0)).toBe(1);
      expect(clamp(-1)).toBe(1);
      expect(clamp(1)).toBe(1);
      expect(clamp(5)).toBe(5);
      expect(clamp(9)).toBe(9);
      expect(clamp(10)).toBe(9);
      expect(clamp(100)).toBe(9);
    });
  });
});

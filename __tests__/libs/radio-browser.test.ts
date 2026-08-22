import {
  formatBitrate,
  getCountryFlag,
  getCuratedCarouselStations,
  getPrimaryTags,
  getStationsByGenre,
  getTopStations,
  registerStationClick,
  searchStations,
} from '../../libs/radio-browser';

const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

const station = (stationuuid: string, name = stationuuid) =>
  ({ stationuuid, name }) as any;

const ok = (body: unknown) => ({ ok: true, status: 200, json: () => Promise.resolve(body) });

describe('libs/radio-browser', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('formatting helpers', () => {
    it('formats a bitrate and drops a missing one', () => {
      expect(formatBitrate(128)).toBe('128kbps');
      expect(formatBitrate(0)).toBe('');
      expect(formatBitrate(-1)).toBe('');
    });

    it('takes the first tags and skips overlong ones', () => {
      expect(getPrimaryTags('lofi, chill, jazz')).toEqual(['lofi', 'chill']);
      expect(getPrimaryTags('lofi, chill, jazz', 3)).toEqual(['lofi', 'chill', 'jazz']);
      expect(getPrimaryTags('')).toEqual([]);
      // A 20+ character "tag" is a sentence somebody typed into the wrong box.
      expect(getPrimaryTags('a-very-long-tag-that-nobody-wants, pop')).toEqual(['pop']);
    });

    it('turns a country code into a flag, and anything else into a globe', () => {
      expect(getCountryFlag('GB')).toBe('🇬🇧');
      expect(getCountryFlag('gb')).toBe('🇬🇧');
      expect(getCountryFlag('')).toBe('🌐');
      expect(getCountryFlag('GBR')).toBe('🌐');
    });
  });

  describe('requests', () => {
    it('asks for top stations with broken ones hidden', async () => {
      mockFetch.mockResolvedValueOnce(ok([station('a')]));
      await expect(getTopStations(5)).resolves.toEqual([station('a')]);
      expect(mockFetch.mock.calls[0][0]).toContain('/stations/topvote?limit=5&hidebroken=true');
    });

    it('encodes a search query', async () => {
      mockFetch.mockResolvedValueOnce(ok([]));
      await searchStations('lofi & chill');
      expect(mockFetch.mock.calls[0][0]).toContain('name=lofi%20%26%20chill');
    });

    it('maps the "top" genre back onto topvote rather than a tag', async () => {
      mockFetch.mockResolvedValueOnce(ok([]));
      await getStationsByGenre('top', 10);
      expect(mockFetch.mock.calls[0][0]).toContain('/stations/topvote');
    });

    it('maps a genre id onto its tag', async () => {
      mockFetch.mockResolvedValueOnce(ok([]));
      await getStationsByGenre('hiphop', 10);
      expect(mockFetch.mock.calls[0][0]).toContain('/stations/bytag/hip%20hop');
    });

    it('falls through to the next server when one fails', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 503 })
        .mockResolvedValueOnce(ok([station('a')]));
      await expect(getTopStations()).resolves.toEqual([station('a')]);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch.mock.calls[0][0]).not.toBe(mockFetch.mock.calls[1][0]);
    });

    it('throws once every server has been tried', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });
      await expect(getTopStations()).rejects.toThrow();
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('swallows a failed click registration', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });
      await expect(registerStationClick('uuid')).resolves.toBeUndefined();
    });
  });

  describe('getCuratedCarouselStations', () => {
    it('is one byuuid call plus one topvote, not one search per name', async () => {
      mockFetch.mockResolvedValue(ok([]));
      await getCuratedCarouselStations();
      expect(mockFetch).toHaveBeenCalledTimes(2);
      const urls = mockFetch.mock.calls.map((c) => c[0] as string);
      expect(urls.some((u) => u.includes('/stations/byuuid?uuids='))).toBe(true);
      expect(urls.some((u) => u.includes('/stations/topvote'))).toBe(true);
      expect(urls.some((u) => u.includes('/stations/search'))).toBe(false);
    });

    it('restores the curated order byuuid does not preserve, then pads from topvote', async () => {
      // byuuid answers in its own order; the second and first curated uuids.
      mockFetch
        .mockResolvedValueOnce(
          ok([
            station('9af1536b-1acd-11ea-a620-52543be04c81', 'Nightwave'),
            station('4260f1f5-d5b3-44d5-9666-355da4da0b21', 'Lofi'),
          ]),
        )
        .mockResolvedValueOnce(ok([station('top-1'), station('top-2')]));

      const result = await getCuratedCarouselStations(4);
      expect(result.map((s) => s.name)).toEqual(['Lofi', 'Nightwave', 'top-1', 'top-2']);
    });

    it('never repeats a station that is both curated and top-voted', async () => {
      const curatedId = '4260f1f5-d5b3-44d5-9666-355da4da0b21';
      mockFetch
        .mockResolvedValueOnce(ok([station(curatedId, 'Lofi')]))
        .mockResolvedValueOnce(ok([station(curatedId, 'Lofi'), station('top-1')]));

      const result = await getCuratedCarouselStations(4);
      expect(result.map((s) => s.stationuuid)).toEqual([curatedId, 'top-1']);
    });

    it('still returns the top stations when byuuid fails outright', async () => {
      // Keyed on the url, not on call order: the two requests go out together,
      // so byuuid's three server retries interleave with the topvote call.
      mockFetch.mockImplementation((url: string) =>
        Promise.resolve(
          url.includes('/stations/byuuid')
            ? { ok: false, status: 500 }
            : ok([station('top-1')]),
        ),
      );

      await expect(getCuratedCarouselStations(4)).resolves.toEqual([station('top-1')]);
    });
  });
});

/**
 * "3 Zorunlu Kategori" bonus mekaniği — koşul (predicate) motoru.
 *
 * Saf fonksiyonlar; React/DOM bağımlılığı yok. Bir koşul, bir oyuncunun belirli
 * bir kategoriye uyup uymadığını söyleyen bir predicate'tir. Maç başında 3
 * çatışmasız koşul seçilir; her iki oyuncu da elinden bu koşullara birer kart atar.
 *
 * Predicate'ler mevcut veri katmanını yeniden kullanır (yeni motor değil):
 *   - Player alanları (position, nationalityCode, isActive, stats, achievements)
 *   - clubsById üzerinden kulüp/lig bilgisi (playerFilters ile aynı kaynak)
 */
import type { Player } from '@futbol-kart/shared-types';

/** Kulüp için ihtiyaç duyulan minimum bilgi (lig/ülke koşulları). */
export interface ClubCountryInfo {
  countryCode: string;
}

export interface ConditionContext {
  clubsById: Map<string, ClubCountryInfo>;
}

export interface CategoryCondition {
  /** Kararlı kimlik (seed'e bağlı seçimde tekrar üretilebilirlik). */
  id: string;
  /** Oyuncuya gösterilecek koşul metni (TR). */
  label: string;
  /**
   * Çatışma grubu: aynı gruptan iki koşul aynı maçta birlikte SEÇİLMEZ
   * (ör. iki milliyet koşulu yan yana gelmesin).
   */
  conflictGroup: string;
  /** Oyuncu bu koşulu sağlıyor mu? */
  test: (player: Player, ctx: ConditionContext) => boolean;
}

/** Oyuncunun forma giydiği kulüplerin (lookup'tan) ülke kodları kümesi. */
function clubCountryCodes(player: Player, ctx: ConditionContext): Set<string> {
  const set = new Set<string>();
  for (const stint of player.clubs) {
    const club = ctx.clubsById.get(stint.clubId);
    if (club?.countryCode) set.add(club.countryCode);
  }
  return set;
}

/** Oyuncu belirli bir clubId'de oynamış mı? */
function playedForClub(player: Player, clubId: string): boolean {
  return player.clubs.some((s) => s.clubId === clubId);
}

// ===========================
// Koşul kütüphanesi
// ===========================
//
// NOT: Buradaki koşullar GENİŞ tutuldu; maç başında havuza göre fizibil olanlar
// süzülür (bkz. bonusSelection.ts). conflictGroup ile çeşitlilik garanti edilir.

const POSITION_LABEL: Record<string, string> = {
  GK: 'kaleci', DEF: 'defans oyuncusu', MID: 'orta saha oyuncusu', FWD: 'forvet',
};

/**
 * Statik (parametresiz) koşul kütüphanesini üretir. Bazı koşullar veri-bağımlı
 * eşik kullanır; hepsi pure.
 */
export function buildConditionLibrary(): CategoryCondition[] {
  const out: CategoryCondition[] = [];

  // --- Pozisyon ---
  for (const pos of ['GK', 'DEF', 'MID', 'FWD'] as const) {
    out.push({
      id: `pos_${pos}`,
      label: `${POSITION_LABEL[pos]} olan`,
      conflictGroup: 'position',
      test: (p) => p.position === pos,
    });
  }

  // --- Milliyet (yaygın futbol ülkeleri) ---
  const NATIONS: Array<{ code: string; name: string }> = [
    { code: 'TR', name: 'Türk' }, { code: 'BR', name: 'Brezilyalı' },
    { code: 'AR', name: 'Arjantinli' }, { code: 'FR', name: 'Fransız' },
    { code: 'DE', name: 'Alman' }, { code: 'ES', name: 'İspanyol' },
    { code: 'IT', name: 'İtalyan' }, { code: 'GB', name: 'İngiliz' },
    { code: 'PT', name: 'Portekizli' }, { code: 'NL', name: 'Hollandalı' },
  ];
  for (const n of NATIONS) {
    out.push({
      id: `nat_${n.code}`,
      label: `${n.name} bir oyuncu`,
      conflictGroup: 'nationality',
      test: (p) => p.nationalityCode === n.code,
    });
  }

  // --- Lig (forma giydiği kulübün ülkesi) ---
  const LEAGUES: Array<{ code: string; name: string }> = [
    { code: 'TR', name: 'Türkiye' }, { code: 'ES', name: 'İspanya' },
    { code: 'IT', name: 'İtalya' }, { code: 'DE', name: 'Almanya' },
    { code: 'GB', name: 'İngiltere' }, { code: 'FR', name: 'Fransa' },
  ];
  for (const lg of LEAGUES) {
    out.push({
      id: `league_${lg.code}`,
      label: `${lg.name}'da forma giymiş`,
      conflictGroup: 'league',
      test: (p, ctx) => clubCountryCodes(p, ctx).has(lg.code),
    });
  }

  // --- Aktiflik / çağ ---
  out.push({
    id: 'active',
    label: 'hâlâ aktif olan',
    conflictGroup: 'status',
    test: (p) => p.isActive === true,
  });
  out.push({
    id: 'retired',
    label: 'kariyerini bitirmiş (emekli)',
    conflictGroup: 'status',
    test: (p) => p.isActive === false,
  });

  // --- Kupa (achievements.trophies) ---
  out.push({
    id: 'won_ucl',
    label: 'Şampiyonlar Ligi kazanmış',
    conflictGroup: 'trophy-eu',
    test: (p) => (p.achievements.trophies?.uclTitles ?? 0) > 0,
  });
  out.push({
    id: 'won_ucl_2plus',
    label: 'en az 2 Şampiyonlar Ligi kazanmış',
    conflictGroup: 'trophy-eu',
    test: (p) => (p.achievements.trophies?.uclTitles ?? 0) >= 2,
  });
  out.push({
    id: 'won_world_cup',
    label: 'Dünya Kupası kazanmış',
    conflictGroup: 'trophy-nat',
    test: (p) => (p.achievements.trophies?.worldCupTitles ?? 0) > 0,
  });
  out.push({
    id: 'won_domestic_cup',
    label: 'en az bir ulusal kupa kazanmış',
    conflictGroup: 'trophy-dom',
    test: (p) => (p.achievements.trophies?.domesticCupTitles ?? 0) > 0,
  });
  out.push({
    id: 'won_league_title',
    label: 'en az bir lig şampiyonluğu kazanmış',
    conflictGroup: 'trophy-dom',
    test: (p) => (p.achievements.trophies?.domesticLeagueTitles ?? 0) > 0,
  });

  // --- Turnuva tecrübesi (stats.competitions) ---
  out.push({
    id: 'played_ucl',
    label: 'Şampiyonlar Ligi maçına çıkmış',
    conflictGroup: 'comp-eu',
    test: (p) => (p.stats.competitions?.uclApps ?? 0) > 0,
  });
  out.push({
    id: 'played_world_cup',
    label: 'Dünya Kupası finallerinde oynamış',
    conflictGroup: 'comp-nat',
    test: (p) => (p.stats.competitions?.worldCupApps ?? 0) > 0,
  });

  // --- Bireysel ödül ---
  out.push({
    id: 'won_ballon_dor',
    label: 'Ballon d\'Or kazanmış',
    conflictGroup: 'individual',
    test: (p) => (p.achievements.trophies?.individual?.ballonDor ?? 0) > 0,
  });

  // --- İstatistik eşikleri ---
  out.push({
    id: 'goals_100',
    label: '100+ resmi gol atmış',
    conflictGroup: 'stat-goals',
    test: (p) => p.stats.totalGoals >= 100,
  });
  out.push({
    id: 'apps_500',
    label: '500+ resmi maça çıkmış',
    conflictGroup: 'stat-apps',
    test: (p) => p.stats.totalApps >= 500,
  });
  out.push({
    id: 'caps_50',
    label: '50+ A milli maça çıkmış',
    conflictGroup: 'stat-nat',
    test: (p) => p.stats.nationalCaps >= 50,
  });

  return out;
}

export { playedForClub };

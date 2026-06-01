/**
 * "3 Zorunlu Kategori" — maç başı koşul seçimi + fizibilite.
 *
 * Saf fonksiyonlar. Verilen iki el (P1/P2) için, HER İKİ elin de 3 koşulu 3
 * FARKLI kartla aynı anda karşılayabildiği, çatışma grubu farklı 3 koşul seçer.
 *
 * Fizibilite, küçük (3×8) bir bipartite eşleştirme ile garanti edilir — koşullar
 * "boşa düşmez", oyuncu her zaman 3 kartını atayabilir.
 */
import type { Player } from '@futbol-kart/shared-types';
import type {
  CategoryCondition,
  ConditionContext,
} from './bonusConditions';

export interface BonusSelectionResult {
  conditions: CategoryCondition[]; // tam 3 koşul (veya boş = bonus yok)
}

/**
 * Bir koşulu, bir eldeki hangi kartların sağladığını döndürür.
 */
function satisfyingCards(
  cond: CategoryCondition,
  hand: Player[],
  ctx: ConditionContext,
): Set<string> {
  const out = new Set<string>();
  for (const p of hand) if (cond.test(p, ctx)) out.add(p.id);
  return out;
}

/**
 * 3 koşulun verilen elde 3 FARKLI kartla aynı anda karşılanıp karşılanamadığı.
 * Küçük boyut (3 koşul) için basit DFS artırma yolu (augmenting path) yeterli.
 */
function hasPerfectMatching(condCardSets: Array<Set<string>>): boolean {
  const assignment = new Map<string, number>(); // cardId -> condIndex
  const tryAssign = (condIdx: number, seen: Set<string>): boolean => {
    for (const cardId of condCardSets[condIdx]!) {
      if (seen.has(cardId)) continue;
      seen.add(cardId);
      const occupant = assignment.get(cardId);
      if (occupant === undefined || tryAssign(occupant, seen)) {
        assignment.set(cardId, condIdx);
        return true;
      }
    }
    return false;
  };
  for (let i = 0; i < condCardSets.length; i++) {
    if (!tryAssign(i, new Set())) return false;
  }
  return true;
}

/**
 * Maç başında 3 bonus koşulu seç.
 *
 * @param library    Tüm koşul adayları (buildConditionLibrary).
 * @param p1Hand     P1'in 8 kartı (Player nesneleri).
 * @param p2Hand     P2'nin 8 kartı.
 * @param ctx        clubsById içeren bağlam.
 * @param rng        Deterministik PRNG (0..1).
 * @returns          3 koşul; fizibil set bulunamazsa boş dizi (bonus turu atlanır).
 */
export function pickBonusConditions(
  library: CategoryCondition[],
  p1Hand: Player[],
  p2Hand: Player[],
  ctx: ConditionContext,
  rng: () => number,
): BonusSelectionResult {
  // 1) Her iki elde de en az 1 kartın sağladığı koşullar (tek-koşul fizibilitesi).
  type Cand = { cond: CategoryCondition; p1: Set<string>; p2: Set<string> };
  const candidates: Cand[] = [];
  for (const cond of library) {
    const p1 = satisfyingCards(cond, p1Hand, ctx);
    if (p1.size === 0) continue;
    const p2 = satisfyingCards(cond, p2Hand, ctx);
    if (p2.size === 0) continue;
    candidates.push({ cond, p1, p2 });
  }
  if (candidates.length < 3) return { conditions: [] };

  // 2) Deterministik karıştır (Fisher-Yates, rng ile).
  const shuffled = [...candidates];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }

  // 3) Çatışma grubu farklı + iki elde de 3-eşleşme fizibil ilk üçlüyü bul.
  //    Greedy ekleme + her adımda bipartite kontrol (3 koşul küçük, ucuz).
  const chosen: Cand[] = [];
  const usedGroups = new Set<string>();
  for (const c of shuffled) {
    if (chosen.length === 3) break;
    if (usedGroups.has(c.cond.conflictGroup)) continue;
    const trial = [...chosen, c];
    const p1ok = hasPerfectMatching(trial.map((t) => t.p1));
    const p2ok = hasPerfectMatching(trial.map((t) => t.p2));
    if (!p1ok || !p2ok) continue;
    chosen.push(c);
    usedGroups.add(c.cond.conflictGroup);
  }

  if (chosen.length < 3) return { conditions: [] };
  return { conditions: chosen.map((c) => c.cond) };
}

/**
 * Bir el için, 3 koşula geçerli bir kart→koşul ataması üretir (bot/otomatik için).
 * Döndürülen: condIndex → cardId. Fizibil değilse null.
 */
export function autoAssign(
  conditions: CategoryCondition[],
  hand: Player[],
  ctx: ConditionContext,
): Array<string | null> | null {
  const sets = conditions.map((c) => satisfyingCards(c, hand, ctx));
  // Augmenting-path eşleştirme; assignment cardId->condIdx
  const assignment = new Map<string, number>();
  const tryAssign = (condIdx: number, seen: Set<string>): boolean => {
    for (const cardId of sets[condIdx]!) {
      if (seen.has(cardId)) continue;
      seen.add(cardId);
      const occ = assignment.get(cardId);
      if (occ === undefined || tryAssign(occ, seen)) {
        assignment.set(cardId, condIdx);
        return true;
      }
    }
    return false;
  };
  for (let i = 0; i < conditions.length; i++) {
    if (!tryAssign(i, new Set())) return null;
  }
  const result: Array<string | null> = conditions.map(() => null);
  for (const [cardId, condIdx] of assignment) result[condIdx] = cardId;
  return result;
}

/**
 * Bir kartın belirli bir koşulu sağlayıp sağlamadığı (UI ataması doğrulaması).
 */
export function cardSatisfies(
  cond: CategoryCondition,
  player: Player,
  ctx: ConditionContext,
): boolean {
  return cond.test(player, ctx);
}

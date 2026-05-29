/**
 * Bir sonraki sahnelerin arka plan görsellerini düşük öncelikle preload eder.
 * Ana sayfada render edilir — kullanıcı CTA'ya tıklamadan önce mode/pick/round
 * görselleri tarayıcı önbelleğine alınmış olur, ilk sahne geçişinde flicker yok.
 *
 * fetchPriority="low" → hero görselini yavaşlatmaz, idle bandwidth kullanır.
 */
const PRELOAD_IMAGES = [
  '/hero/scene-mode.webp', // CTA tıklayınca ilk açılacak sahne
  '/hero/scene-pick.webp', // mod seç sonrası
  '/hero/scene-round.webp', // tur sahnesi (en sık kullanılır)
];

export function ScenePreload() {
  return (
    <>
      {PRELOAD_IMAGES.map((href) => (
        <link
          key={href}
          rel="preload"
          as="image"
          href={href}
          // @ts-expect-error — fetchPriority React 18.3'te DOM'a basılır, type henüz yok
          fetchpriority="low"
        />
      ))}
    </>
  );
}

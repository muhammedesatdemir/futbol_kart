import { z } from 'zod';

/**
 * Şablon kategorileri — UI'da gruplandırma ve istatistik için.
 */
export const categoryEnum = z.enum([
  'numeric',   // Klasik sayısal (gol, maç, asist, boy, kariyer yılı)
  'time',      // Zaman/yaş (doğum, debut, kariyer, on yıl)
  'geo',       // Coğrafya (kıta, ülke, mesafe, başkent)
  'club',      // Kulüp kariyeri (sayı, stint, ülke spread)
  'position',  // Pozisyon / ayak (FW/MID/DEF/GK, ayak tercihi)
  'name',      // İsim / kart (harf, hece, sesli)
  'fun',       // Eğlence (asal forma, çift sayı vb.)
  'proximity', // En yakın X (yaş 30'a yakın vb.)
  'boolean',   // Aynı ülke / aynı pozisyon
  'extreme',   // Niche (200cm+, 1000+ maç)
  'composite', // Hibrit (gol+asist, gol/maç)
]);
export type Category = z.infer<typeof categoryEnum>;

/**
 * compute türleri — resolver'da nasıl hesaplanacağı.
 *
 * NOT: id'si custom: ile başlayan şablonlar resolver'da özel switch case ile
 * hesaplanır (compute alanı yalnızca dokümantasyon amaçlıdır).
 */
export const computeEnum = z.enum([
  'identity',     // Doğrudan field değeri (number | boolean)
  'sum',          // Array elemanlarını topla
  'count',        // Array uzunluğu
  'countDistinct',// Set tabanlı sayım
  'distance',     // Coğrafi mesafe
  'proximity',    // |value - target| (target params.target ile gelir)
  'divide',       // numField1 / numField2
  'multiply',     // numField1 * numField2
  'subtract',     // numField1 - numField2
  'fraction',     // (numField1 + numField2) / numField3 gibi formül
  'boolCheck',    // Field değeri belirli sete uyuyor mu (params.values)
  'regexCount',   // Field'da regex match sayısı
  'birthYear',    // birthDate'ten yıl
  'birthMonth',   // birthDate'ten ay (1-12)
  'birthDay',     // birthDate'ten gün (1-31)
  'birthDayOfWeek', // 0=Sun..6=Sat
  'ageYears',     // Şimdiki yaş
  'debutAge',     // proDebutYear - birthYear
  'custom',       // Resolver'da özel case
]);
export type Compute = z.infer<typeof computeEnum>;

/**
 * Şablon parametre tipi. Parametrik şablonlarda runtime'da rastgele seçilen
 * değerlerle binlerce farklı soru üretilir.
 *
 * Örnek:
 *   - "Yaşı X'e daha yakın" → params: { type: 'int', from: 18, to: 40, name: 'targetAge' }
 *   - "Adında K harfi var mı" → params: { type: 'enum', values: ['A','B','C',...], name: 'letter' }
 */
export const paramSpecSchema = z.object({
  name: z.string(),
  type: z.enum(['int', 'enum', 'float']),
  /** int: alt sınır */
  from: z.number().optional(),
  /** int: üst sınır (dahil) */
  to: z.number().optional(),
  /** int: adım (default 1) */
  step: z.number().optional(),
  /** enum: değer listesi */
  values: z.array(z.union([z.string(), z.number()])).optional(),
  /** Görüntüde gösterilecek metin formatlama hint'i */
  display: z.string().optional(),
});
export type ParamSpec = z.infer<typeof paramSpecSchema>;

export const templateSchema = z.object({
  /** Benzersiz şablon kimliği, örn: "n01_total_apps". */
  id: z.string(),
  /** Kategorisi — UI gruplama için. */
  category: categoryEnum,
  /**
   * Çok dilli başlık. {param} placeholder'ları runtime'da değiştirilir.
   *
   * Örn: "Yaşı {targetAge} yıla daha yakın olan oyuncu kazanır."
   */
  title: z.record(z.string()),
  /** İsteğe bağlı açıklama (uzun form). */
  description: z.record(z.string()).optional(),
  /**
   * Soru üretildikten sonra OYUNCULARA gösterilecek hesaplama formülü açıklaması.
   * Örnek: "Hesaplama: Forma numaralarının aritmetik toplamı"
   */
  formula: z.record(z.string()).optional(),

  /** Hesaplamada kullanılan ana alan (örn: stats.totalGoals). */
  field: z.string(),
  /** Hesaplama türü. */
  compute: computeEnum,
  /** Karşılaştırma yönü: maksimum kazanır / minimum kazanır / boolean (true kazanır). */
  compareOp: z.enum(['max', 'min', 'bool']),
  /** Beraberlik bozucular: "<path>:max|min" veya "random". */
  tiebreakers: z.array(z.string()),
  /** Şablonun çalışması için bu alanların DOLU olması gerekir (havuz filtresi). */
  requiresFields: z.array(z.string()),

  /** Parametre tanımları — şablon parametrikse. */
  params: z.array(paramSpecSchema).optional(),
  /**
   * Düşük havuz oranında ŞABLON otomatik atlanabilir.
   * %80 default; özel ise burada belirt (örn. 0.6 = %60 yeterli).
   */
  minPoolCoverage: z.number().optional(),
  /**
   * Etiketler — havuz seçimi ve dengeleme için.
   * Örn: ['quick', 'humor', 'classic']
   */
  tags: z.array(z.string()).optional(),
});

export type Template = z.infer<typeof templateSchema>;

export const templatesSchema = z.array(templateSchema);

/**
 * Runtime parametre değerleri. Parametrik bir şablon seçildiğinde bu obje üretilir.
 */
export interface TemplateParams {
  [paramName: string]: string | number;
}

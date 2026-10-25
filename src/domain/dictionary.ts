import { cleanMerchant, merchantKey } from './merchant';
import type { MerchantRule } from './types';

/**
 * Starter merchant → category dictionary, matched as a prefix of the merchant key (letters and digits only).
 * Covers common Singapore merchants plus ones seen on sample POSB/DBS and HSBC statements.
 * The user's own rules always win over these.
 */
export const STARTER_RULES: Record<string, string[]> = {
  food: [
    'MCDONALD', 'KFC', 'BURGERKING', 'SUBWAY', 'JOLLIBEE', 'WINGSTOP', 'SHAKESHACK', 'MOSBURGER', 'LONGJOHN', 'PIZZAHUT', 'DOMINOS',
    'STARBUCKS', 'LUCKINCOFFEE', 'COFFEEBEAN', 'TOASTBOX', 'YAKUN', 'KILLINEYKOPITIAM', 'FLASHCOFFEE', 'JOOCOFFEE', 'CHAGEE', 'KOI',
    'LIHO', 'GONGCHA', 'CHICHA', 'HEYTEA', 'MIXUE', 'PLAYMADE', 'BREADTALK', 'ANTOINETTE', 'CEDELE', 'PAUL', 'TIONGBAHRUBAKERY',
    'AVENUECREAMERY', 'ANDERSENS', 'LLAOLLAO', 'SUSHIEXPRESS', 'SUSHIRO', 'GENKISUSHI', 'SUKIYA', 'YOSHINOYA', 'PEPPERLUNCH', 'ICHIBAN',
    'SAIZERIYA', 'DINTAIFUNG', 'HAIDILAO', 'PUTIENSEN', 'PUTIEN', 'TSUJIRI', 'ASTONS', 'SONGFA', 'XIANGXIANGHUNAN', 'LENU', 'CASAVOSTRA',
    'WUWEITANG', 'XIAOGUANZI', 'TSKATSU', 'KATSU', 'EAT', 'KOPITIAM', 'FOODREPUBLIC', 'FOODJUNCTION', 'KOUFU', 'FOODPANDA',
    'DELIVEROO', 'GRABFOOD', 'COZYPUB', 'BREWERKZ', 'HARRYS', 'AKITCHEN',
  ],
  groceries: [
    'NTUCFP', 'NTUCFAIRPRICE', 'FAIRPRICE', 'FPXTRA', 'COLDSTORAGE', 'GIANT', 'SHENGSIONG', 'DONDONDONKI', 'DONKI', 'PRIMEMARKET',
    'MARKETPLACE', 'REDMART', 'CHEERS', '7ELEVEN', 'SEVENELEVEN', 'SCARLETT',
  ],
  transport: [
    'BUSMRT', 'TRANSITLINK', 'SIMPLYGO', 'GRAB', 'GOJEK', 'TADA', 'RYDE', 'ZIG', 'COMFORTDELGRO', 'CDGTAXI', 'SHELL', 'ESSO', 'CALTEX',
    'SPC', 'SINOPEC', 'EASYPARK', 'PARKING', 'EPLUSPARKING',
  ],
  shopping: [
    'SHOPEE', 'LAZADA', 'AMAZON', 'TAOBAO', 'TEMU', 'QOO10', 'UNIQLO', 'ZARA', 'HM', 'COTTONON', 'DAISO', 'KKV', 'MINISO', 'IKEA',
    'COURTS', 'HARVEYNORMAN', 'BESTDENKI', 'CHALLENGER', 'POPULAR', 'KINOKUNIYA', 'MUJI', 'DECATHLON', 'TAKASHIMAYA', 'ISETAN',
    'TANGS', 'APPLESTORE',
  ],
  bills: [
    'M1LTD', 'SINGTEL', 'STARHUB', 'SIMBA', 'CIRCLESLIFE', 'GIGA', 'SPSERVICES', 'SPDIGITAL', 'SPGROUP', 'GENECO', 'TUASPOWER',
    'SENOKO', 'TOWNCOUNCIL', 'MYREPUBLIC', 'VIEWQWEST', 'IRAS', 'AIA', 'PRUDENTIAL', 'GREATEASTERN', 'INCOME',
  ],
  entertainment: [
    'NETFLIX', 'SPOTIFY', 'DISNEY', 'YOUTUBE', 'APPLECOMBILL', 'GOOGLEPLAY', 'STEAMPURCHASE', 'STEAMGAMES', 'PLAYSTATION', 'NINTENDO', 'XBOX', 'GV',
    'GOLDENVILLAGE', 'SHAWTHEATRES', 'CATHAYCINEPLEX', 'SISTIC', 'KLOOK', 'FUNEMPIRE', 'TIMEZONE',
  ],
  health: [
    'GUARDIAN', 'WATSONS', 'UNITYPHARMACY', 'POLYCLINIC', 'RAFFLESMEDICAL', 'PARKWAY', 'MOUNTELIZABETH', 'QUALITYHEALTHCARE',
    'FITNESSFIRST', 'ANYTIMEFITNESS', 'ACTIVESG', 'CLASSPASS', 'SEPHORA',
  ],
  travel: [
    'SINGAPOREAIRLINES', 'SIA', 'SCOOT', 'JETSTAR', 'AIRASIA', 'AGODA', 'BOOKINGCOM', 'EXPEDIA', 'AIRBNB', 'TRIPCOM', 'TRAVELOKA',
    'CHANGIAIRPORT',
  ],
};

/** Longest matching pattern first, so "GRABFOOD" beats "GRAB". */
const STARTER_INDEX: [string, string][] = Object.entries(STARTER_RULES)
  .flatMap(([categoryId, patterns]) => patterns.map((p) => [p, categoryId] as [string, string]))
  .sort((a, b) => b[0].length - a[0].length);

export type CategorySource = 'rule' | 'starter';

/** Suggest a category for a statement description: the user's rules first, then the starter dictionary. */
export function suggestCategory(description: string, rules: MerchantRule[]): { categoryId: string; source: CategorySource } | null {
  const key = merchantKey(description);
  if (!key) return null;
  const rule = rules.filter((r) => key.startsWith(r.id)).sort((a, b) => b.id.length - a.id.length)[0];
  if (rule) return { categoryId: rule.categoryId, source: 'rule' };
  // Very short patterns (e.g. "GV", "HM") must be the whole first word, so "H&M ORCHARD" is H&M but "HMART" isn't.
  const firstWord = cleanMerchant(description).split(' ')[0].toUpperCase().replace(/[^A-Z0-9]/g, '');
  const starter = STARTER_INDEX.find(([p]) => (p.length <= 3 ? firstWord === p : key.startsWith(p)));
  return starter ? { categoryId: starter[1], source: 'starter' } : null;
}

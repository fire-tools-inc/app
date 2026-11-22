/**
 * Generic, multilingual starter vocabulary for expense categorization.
 *
 * Each phrase becomes a small pseudo-document for the local BM25 matcher in
 * expenseMatcher.ts. The user's own history always carries more weight, so
 * these entries only matter until the app has learned how someone files their
 * expenses. Entries are common words (English, Italian, German, French,
 * Spanish and a few Dutch everyday terms) and widely known international or
 * European brands. They contain no personal data.
 */
import type { ExpenseCategory } from '../types/expenseTracker';

export type ExpenseSeedLexicon = Readonly<Partial<Record<ExpenseCategory, readonly string[]>>>;

export const EXPENSE_SEED_LEXICON: ExpenseSeedLexicon = {
  GROCERIES: [
    'groceries', 'grocery', 'grocery shopping', 'supermarket', 'market', 'food shopping', 'weekly shop',
    'spesa', 'supermercato', 'alimentari', 'Lebensmittel', 'Supermarkt', 'Einkauf', 'supermarché', 'épicerie',
    'supermercado', 'compra', 'boodschappen',
    'Albert Heijn', 'Jumbo', 'Lidl', 'Aldi', 'Carrefour', 'Tesco', "Sainsbury's", 'Rewe', 'Edeka', 'Conad', 'Coop',
    'Esselunga', 'Dirk', 'Vomar', 'Flink', 'Spar', 'Penny', 'Netto', 'Mercadona', 'Monoprix', 'Auchan',
    'Whole Foods', 'Walmart', 'Kaufland', 'Picnic',
  ],
  DINING_OUT: [
    'lunch', 'dinner', 'breakfast', 'brunch', 'restaurant', 'pizza', 'pizzeria', 'burger', 'kebab', 'doner',
    'sushi', 'ramen', 'noodles', 'takeaway', 'take away', 'food delivery', 'coffee', 'cafe', 'espresso',
    'cappuccino', 'snack', 'gelato', 'ice cream', 'bakery', 'pastry', 'sandwich', 'canteen',
    'pranzo', 'cena', 'colazione', 'ristorante', 'trattoria', 'osteria', 'pasticceria', 'Mittagessen',
    'Abendessen', 'Frühstück', 'Bäckerei', 'Imbiss', 'déjeuner', 'dîner', 'petit déjeuner', 'boulangerie',
    'brasserie', 'almuerzo', 'desayuno', 'tapas', 'cafetería',
    "McDonald's", 'Burger King', 'KFC', 'Five Guys', 'Starbucks', 'Subway sandwich', "Domino's", 'Deliveroo',
    'Uber Eats', 'Thuisbezorgd', 'Just Eat', 'Glovo', 'Lieferando', 'Wolt', 'Costa Coffee', 'Pret',
  ],
  TRANSPORTATION: [
    'uber', 'taxi', 'cab', 'train', 'train ticket', 'metro', 'subway', 'underground', 'bus', 'tram',
    'public transport', 'ticket', 'ov-chipkaart', 'NS', 'Trenitalia', 'Italo', 'Deutsche Bahn', 'SNCF', 'Renfe',
    'FlixBus', 'fuel', 'petrol', 'gasoline', 'diesel', 'gas station', 'parking', 'toll', 'motorway toll',
    'bike', 'bike repair', 'scooter', 'bolt', 'lyft', 'lime', 'Swapfiets', 'car sharing', 'ev charging',
    'charging station', 'car wash', 'car service', 'benzina', 'treno', 'biglietto', 'autobus', 'parcheggio',
    'pedaggio', 'Benzin', 'Tankstelle', 'Zug', 'Fahrkarte', 'Parken', 'carburant', 'essence', 'péage',
    'gasolina', 'peaje', 'aparcamiento', 'tren', 'billete',
  ],
  UTILITIES: [
    'electricity', 'electric bill', 'energy', 'energy bill', 'gas bill', 'water', 'water bill', 'internet',
    'phone', 'phone bill', 'mobile', 'mobile plan', 'broadband', 'wifi', 'bill', 'utility', 'utilities',
    'heating', 'bolletta', 'luce', 'gas e luce', 'acqua', 'Strom', 'Wasser', 'Nebenkosten', 'Heizung',
    'électricité', 'facture', 'eau', 'luz', 'agua', 'factura', 'energierekening',
    'KPN', 'Vodafone', 'T-Mobile', 'Odido', 'Orange', 'TIM', 'Ziggo', 'Eneco', 'Vattenfall', 'Essent', 'Enel',
    'EDF', 'Iliad', 'Fastweb', 'Telekom', 'Movistar',
  ],
  HOUSING: [
    'rent', 'mortgage', 'cleaning', 'cleaner', 'laundry', 'maintenance', 'repair', 'home repair', 'plumber',
    'electrician', 'handyman', 'landlord', 'condominium', 'property tax', 'affitto', 'mutuo', 'condominio',
    'pulizie', 'lavanderia', 'idraulico', 'Miete', 'Hypothek', 'Reinigung', 'loyer', 'ménage', 'alquiler',
    'hipoteca', 'limpieza', 'huur',
  ],
  SUBSCRIPTIONS: [
    'Spotify', 'Netflix', 'Disney+', 'Amazon Prime', 'Prime Video', 'Apple Music', 'Apple TV',
    'iCloud', 'YouTube Premium', 'HBO', 'HBO Max', 'Paramount+', 'DAZN', 'Google One', 'Dropbox', 'Patreon',
    'subscription', 'monthly subscription', 'streaming', 'abbonamento', 'Abo', 'Abonnement', 'abonnement',
    'suscripción',
  ],
  HEALTHCARE: [
    'doctor', 'gp', 'dentist', 'dental', 'pharmacy', 'meds', 'medicine', 'medication', 'prescription',
    'therapy', 'therapist', 'psychologist', 'hospital', 'clinic', 'physio', 'physiotherapy', 'optician',
    'contact lenses', 'farmacia', 'medico', 'dentista', 'psicologo', 'fisioterapia', 'ospedale', 'Apotheke',
    'Arzt', 'Zahnarzt', 'Krankenhaus', 'pharmacie', 'médecin', 'dentiste', 'hôpital', 'médico', 'huisarts',
    'apotheek', 'tandarts',
  ],
  PERSONAL_CARE: [
    'barber', 'haircut', 'hairdresser', 'hair salon', 'gym', 'gym membership', 'fitness', 'shampoo',
    'toiletries', 'cosmetics', 'skincare', 'makeup', 'spa', 'massage', 'nails', 'manicure', 'parrucchiere',
    'barbiere', 'palestra', 'estetista', 'Friseur', 'Fitnessstudio', 'Kosmetik', 'coiffeur', 'salle de sport',
    'peluquería', 'gimnasio', 'kapper', 'sportschool',
    'Basic-Fit', 'Kruidvat', 'Rossmann', 'Etos', 'Sephora', 'Douglas', 'Boots',
  ],
  INSURANCE: [
    'insurance', 'health insurance', 'car insurance', 'home insurance', 'life insurance', 'liability insurance',
    'travel insurance', 'assicurazione', 'Versicherung', 'Krankenversicherung', 'assurance', 'mutuelle',
    'seguro', 'verzekering', 'zorgverzekering',
  ],
  DEBT_PAYMENTS: [
    'loan', 'loan repayment', 'repayment', 'installment', 'instalment', 'credit card payment', 'student loan',
    'rata', 'prestito', 'finanziamento', 'Kredit', 'Ratenzahlung', 'crédit', 'remboursement', 'préstamo',
    'cuota', 'lening',
  ],
  EDUCATION: [
    'course', 'online course', 'tuition', 'school', 'school fees', 'university', 'college', 'textbook',
    'training', 'workshop', 'certification', 'exam', 'language course', 'Udemy', 'Coursera', 'edX', 'corso',
    'scuola', 'università', 'Kurs', 'Schule', 'Universität', 'Studiengebühren', 'cours', 'école', 'université',
    'curso', 'escuela', 'universidad', 'matrícula',
  ],
  BUSINESS: [
    'bank fee', 'account fee', 'card fee', 'yearly fee', 'annual fee', 'monthly fee', 'atm fee',
    'transaction fee', 'service charge', 'fee', 'commission', 'domain', 'hosting', 'web hosting', 'consulting',
    'conference', 'software licence', 'software license', 'accountant', 'tax advisor', 'broker fee',
    'coworking', 'business', 'commissione', 'commissioni', 'spese bancarie', 'canone', 'Gebühr',
    'Kontoführungsgebühr', 'frais', 'frais bancaires', 'comisión',
    'GitHub', 'Google Workspace', 'Microsoft 365', 'AWS',
  ],
  SHOPPING: [
    'Amazon', 'household', 'household items', 'homeware', 'home decor', 'kitchenware', 'decoration',
    'department store', 'IKEA', 'Action', 'HEMA', 'bol.com', 'eBay', 'AliExpress', 'Temu', 'Etsy', 'Target',
    'Costco', 'casalinghi', 'Haushalt', 'ménager', 'hogar',
  ],
  CLOTHING: [
    'clothes', 'clothing', 'shoes', 'sneakers', 'boots', 'socks', 'jacket', 'coat', 'shirt', 't-shirt',
    'jeans', 'trousers', 'dress', 'skirt', 'underwear', 'sweater', 'hoodie', 'accessories', 'handbag', 'belt',
    'vestiti', 'abbigliamento', 'scarpe', 'giacca', 'maglietta', 'Kleidung', 'Schuhe', 'Jacke', 'vêtements',
    'chaussures', 'veste', 'ropa', 'zapatos', 'chaqueta', 'kleding', 'schoenen',
    'Zara', 'H&M', 'Uniqlo', 'Zalando', 'Primark', 'Nike', 'Adidas', 'Mango', 'Pull&Bear', 'Bershka', 'Shein',
  ],
  ELECTRONICS: [
    'laptop', 'computer', 'pc', 'smartphone', 'phone case', 'headphones', 'earbuds', 'charger', 'cable', 'usb',
    'monitor', 'keyboard', 'mouse', 'tablet', 'camera', 'tv', 'television', 'electronics', 'gadget', 'printer',
    'Apple Store', 'MediaMarkt', 'Media Markt', 'Coolblue', 'Best Buy', 'Fnac', 'Currys', 'Saturn', 'Unieuro',
    'Euronics', 'elettronica', 'Elektronik', 'électronique', 'electrónica', 'Samsung', 'Logitech', 'Anker',
  ],
  LIFESTYLE_LEISURE: [
    'cinema', 'cinema ticket', 'movie', 'film', 'theatre', 'theater', 'museum', 'concert', 'festival', 'event',
    'bar', 'pub', 'beer', 'drinks', 'cocktail', 'wine bar', 'club', 'nightclub', 'party', 'aperitivo',
    'aperitif', 'bowling', 'escape room', 'zoo', 'theme park', 'Kino', 'Konzert', 'Kneipe', 'cinéma',
    'théâtre', 'musée', 'cine', 'teatro', 'museo', 'concierto', 'Pathé',
  ],
  ENTERTAINMENT: [
    'video games', 'videogame', 'game', 'gaming', 'Steam', 'PlayStation', 'PS5', 'Nintendo', 'Xbox',
    'Game Pass', 'board game', 'books', 'book', 'comics', 'ebook', 'Kindle', 'audiobook', 'Audible',
    'app store', 'Google Play', 'in-game', 'in-app purchase', 'Twitch', 'videogiochi', 'libri', 'fumetti',
    'Spiele', 'Bücher', 'jeux vidéo', 'livres', 'videojuegos', 'libros',
  ],
  MUSIC: [
    'music', 'instrument', 'guitar', 'bass', 'drums', 'strings', 'guitar strings', 'amplifier', 'rehearsal',
    'rehearsal room', 'music lessons', 'music lesson', 'vinyl', 'record', 'sheet music', 'Bandcamp',
    'sala prove', 'chitarra', 'corde', 'lezione di musica', 'Proberaum', 'Gitarre', 'répétition', 'guitare',
    'ensayo', 'guitarra', 'Thomann',
  ],
  COLLECTIBLES: [
    'trading cards', 'Magic the Gathering', 'MTG', 'Pokémon cards', 'Pokémon', 'booster pack', 'figures',
    'action figure', 'Funko', 'LEGO', 'model kit', 'crafts', 'craft supplies', 'collectible', 'collection',
    'hobby', 'hobby supplies', 'Warhammer', 'yarn', 'painting supplies', 'collezione', 'Sammlung', 'colección',
  ],
  TRAVEL: [
    'flight', 'airline', 'plane ticket', 'airport', 'hotel', 'hostel', 'Airbnb', 'Booking.com', 'accommodation',
    'luggage', 'baggage', 'holiday', 'vacation', 'trip', 'travel', 'souvenirs', 'excursion', 'tour', 'cruise',
    'KLM', 'Ryanair', 'easyJet', 'Lufthansa', 'ITA Airways', 'Vueling', 'Transavia', 'Wizz Air',
    'British Airways', 'Air France', 'Expedia', 'Skyscanner', 'volo', 'vacanza', 'vacanze', 'albergo',
    'viaggio', 'Flug', 'Urlaub', 'Reise', 'vol', 'vacances', 'voyage', 'vuelo', 'vacaciones', 'viaje',
    'vakantie', 'vlucht',
  ],
  GIFTS_DONATIONS: [
    'gift', 'present', 'birthday', 'birthday gift', 'wedding', 'wedding gift', 'flowers', 'florist',
    'donation', 'charity', 'fundraiser', 'regalo', 'regali', 'compleanno', 'matrimonio', 'fiori', 'beneficenza',
    'donazione', 'Geschenk', 'Geburtstag', 'Blumen', 'Spende', 'cadeau', 'anniversaire', 'fleurs', 'don',
    'cumpleaños', 'flores', 'donación', 'GoFundMe', 'verjaardag', 'cadeautje',
  ],
  OTHER: ['misc', 'miscellaneous', 'other', 'varie', 'Sonstiges', 'divers', 'otros'],
};

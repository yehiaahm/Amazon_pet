export const PET_NAMES = ['Rex', 'Bella', 'Max', 'Luna', 'Charlie', 'Lucy', 'Coco', 'Simba', 'Milo', 'Nala', 'Zeus', 'Lola', 'Teddy', 'Daisy', 'Rocky', 'Molly'];
export const SPECIES = ['DOG', 'CAT', 'BIRD', 'OTHER'];
export const BREEDS = { DOG: ['Labrador', 'Golden Retriever', 'German Shepherd', 'Poodle', 'Baladi'], CAT: ['Persian', 'Siamese', 'Baladi'], BIRD: ['Parrot', 'Canary', 'Cockatiel'], OTHER: ['Rabbit', 'Hamster'] };
export const FIRST_NAMES = ['Ahmed', 'Mohamed', 'Sara', 'Fatma', 'Omar', 'Youssef', 'Nour', 'Mariam', 'Ali', 'Hana', 'Khaled', 'Laila', 'Mostafa', 'Salma', 'Amr'];
export const LAST_NAMES = ['Hassan', 'Ibrahim', 'Mahmoud', 'Ali', 'Said', 'Abdel Rahman', 'El Sayed', 'Fathy', 'Kamal'];
export const CATEGORIES = ['Food', 'Toys', 'Grooming', 'Medicine', 'Accessories', 'Bedding'];
export const PRODUCT_NOUNS = ['Dog Food', 'Cat Food', 'Chew Toy', 'Shampoo', 'Flea Collar', 'Leash', 'Cage', 'Vitamin', 'Litter', 'Brush', 'Bed', 'Bowl'];
export const BRANDS = ['Royal Canin', 'Pedigree', 'Whiskas', 'Purina', 'Local Brand', 'PetLux'];

import { randChoice, randInt, randDecimal } from './client.mjs';

export function randomPhone() {
  return '01' + randInt(0, 2) + Array.from({ length: 8 }, () => randInt(0, 9)).join('');
}

export function randomCustomerName() {
  return `${randChoice(FIRST_NAMES)} ${randChoice(LAST_NAMES)}`;
}

export function randomPetName() { return randChoice(PET_NAMES); }

export function randomPet() {
  const species = randChoice(SPECIES);
  return { name: randomPetName(), species, breed: randChoice(BREEDS[species]), age: randInt(0, 12) };
}

export function randomProduct(uniqueSuffix) {
  const noun = randChoice(PRODUCT_NOUNS);
  const brand = randChoice(BRANDS);
  const sku = `LT-${uniqueSuffix}`;
  const cost = randDecimal(20, 300, 2);
  const price = +(cost * randDecimal(1.2, 1.8, 3)).toFixed(2);
  return {
    product: { name: `${brand} ${noun} ${uniqueSuffix}`, sku, categoryName: randChoice(CATEGORIES), brandName: brand },
    variant: { name: 'قياسي', price, cost, initialStock: 0 },
  };
}

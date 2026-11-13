import { siApple, siRazer, siVisa } from 'simple-icons'

export type CardBrand = {
  id: string
  name: string
  description: string
  accent: string
  icon?: typeof siApple
  shortName?: string
}

export const cardBrands: CardBrand[] = [
  {
    id: 'apple',
    name: 'Apple Gift Card',
    description: 'For Apple products, services, and subscriptions.',
    accent: '#18191b',
    icon: siApple,
  },
  {
    id: 'xbox',
    name: 'Xbox Gift Card',
    description: 'For games, add-ons, and entertainment on Xbox.',
    accent: '#107c10',
    shortName: 'XBOX',
  },
  {
    id: 'razer',
    name: 'Razer Gold',
    description: 'A payment option for games and digital content.',
    accent: '#44d62c',
    icon: siRazer,
  },
  {
    id: 'visa',
    name: 'Visa Gift Card',
    description: 'A prepaid card on the Visa payment network.',
    accent: '#1a1f71',
    icon: siVisa,
  },
  {
    id: 'other',
    name: 'Other Gift Cards',
    description: 'Choose this for another supported card type.',
    accent: '#426b5b',
  },
]

export function getBrand(id: string | null | undefined): CardBrand {
  return cardBrands.find((brand) => brand.id === id) ?? cardBrands[0]
}

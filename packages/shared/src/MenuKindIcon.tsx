import { CupSoda, UtensilsCrossed } from 'lucide-react';
import type { MenuKind } from './menuKind.js';

/**
 * ไอคอนกำกับประเภทหมวด (อาหาร/เครื่องดื่ม) ที่ใช้ร่วมกันทุกแอป
 *
 * เดิมแต่ละจอเขียน `kind === 'drink' ? CupSoda : UtensilsCrossed` ซ้ำเอง
 * รวมมาไว้ที่เดียวเพื่อให้เปลี่ยนไอคอนทีเดียวมีผลทุกที่
 */

export interface MenuKindIconProps {
  kind: MenuKind;
  size?: number;
  className?: string;
}

export function MenuKindIcon({ kind, size = 16, className }: MenuKindIconProps) {
  const Icon = kind === 'drink' ? CupSoda : UtensilsCrossed;
  return <Icon size={size} className={className} aria-hidden="true" data-kind={kind} />;
}

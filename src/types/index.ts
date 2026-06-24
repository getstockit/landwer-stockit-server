export type UserRole = 'employee' | 'manager';

export interface User {
  id: string;
  name: string;          // השם שהמשתמש בחר לעצמו
  pin: string;            // קוד 4 ספרות להתחברות (פשוט לעובדים)
  passwordHash: string;   // גיבוי - לא בשימוש כרגע אך שמור למסטרפיין
  role: UserRole;
  isActive: boolean;
  createdAt: string;
}

export type LocationType = 'fridge' | 'freezer' | 'warehouse';

export interface Location {
  id: string;
  name: string;
  type: LocationType;
  sortOrder: number;
  isActive: boolean;
}

export interface Product {
  id: string;
  name: string;
  locationId: string;
  unit: string;
  sku: string;           // מק"ט - ריק בהתחלה, מתעדכן ידנית או מ-AI
  price: number;          // מחיר עלות ליחידה (₪) - לעריכה
  minQty: number;
  hasBarcode: boolean;    // false = בצקים/לחמים, ללא מעקב ברקוד
  isActive: boolean;
  createdAt: string;
}

export interface InventoryRow {
  productId: string;
  quantity: number;
  lastUpdated: string;
}

export type MovementType = 'in' | 'out' | 'delivery';
export type Shift = 'morning' | 'afternoon' | 'evening';

export function getShift(dateStr?: string): Shift {
  const h = new Date(dateStr || Date.now()).getHours();
  if (h >= 6 && h < 14) return 'morning';
  if (h >= 14 && h < 20) return 'afternoon';
  return 'evening';
}

export interface Movement {
  id: string;
  type: MovementType;
  productId: string;
  locationId: string;
  quantity: number;        // כמות בפעולה
  quantityAfter: number;   // כמות במלאי לאחר הפעולה
  price: number;            // מחיר ליחידה בזמן הפעולה
  totalValue: number;
  shift: Shift;
  userId: string;
  userName: string;
  createdAt: string;
  notes?: string;
  deliveryId?: string;
}

export interface DeliveryLineItem {
  productName: string;
  sku?: string;
  quantity: number;
  unit: string;
  matched: boolean;
  productId?: string;
  costFromSupplier?: number;
}

export interface Delivery {
  id: string;
  receivedBy: string;
  receiverName: string;
  supplier?: string;
  locationId?: string;
  items: DeliveryLineItem[];
  unmatchedItems: DeliveryLineItem[]; // לא זוהו במערכת - דורש טיפול ידני
  createdAt: string;
}

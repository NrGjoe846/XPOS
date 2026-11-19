export type TaxRegime = 'IN_GST' | 'US_TAX' | 'EU_VAT' | 'ES_IVA';

export type OrderChannel = 'dine_in' | 'takeaway' | 'delivery' | 'qr_table' | 'click_collect';
export type OrderStatus =
  | 'awaiting_payment'
  | 'open'
  | 'in_kitchen'
  | 'ready'
  | 'served'
  | 'paid'
  | 'refunded'
  | 'voided';

export type KotStation = 'Tandoor & Grill' | 'Main Kitchen' | 'South Indian' | 'Bar & Beverages' | 'Pastry';
export type KotStatus = 'queued' | 'preparing' | 'ready' | 'served';

export type TableStatus = 'free' | 'ordering' | 'preparing' | 'served' | 'billing' | 'cleaning' | 'reserved';
export type TableShape = 'square' | 'round' | 'rect';

export type TenderMethod = 'cash' | 'upi' | 'card' | 'gift_card' | 'loyalty' | 'razorpay' | 'stripe' | 'cashfree';

export interface Branch {
  id: string;
  name: string;
  code: string;
  city: string;
  address: string;
  phone: string;
  taxRegime: TaxRegime;
  currency: 'INR' | 'USD' | 'EUR';
  currencySymbol: '₹' | '$' | '€';
  gstin?: string;
  fssai?: string;
  upiVpa: string;
  upiMerchantName: string;
  defaultTaxRate: number;
  serviceChargeRate: number;
  active: boolean;
}

export interface Role {
  id: string;
  name: string;
  permissions: string[];
}

export interface StaffUser {
  id: string;
  branchId: string;
  name: string;
  email: string;
  roleId: string;
  roleName: string;
  pin: string;
  hourlyRate: number;
  overtimeMultiplier: number;
  latePenaltyPerIncident: number;
  twoFactorEnabled: boolean;
  totpSecret?: string;
  recoveryCodes: string[];
  active: boolean;
}

export interface Category {
  id: string;
  name: string;
  sortOrder: number;
  station: KotStation;
  scheduleTag?: string; // e.g. 'All Day', 'Breakfast 07-11', 'Happy Hour 16-19'
}

export interface ModifierOption {
  id: string;
  name: string;
  priceDelta: number;
}

export interface ModifierGroup {
  id: string;
  name: string;
  required: boolean;
  multiSelect: boolean;
  options: ModifierOption[];
}

export interface RecipeIngredientUsage {
  ingredientId: string;
  quantity: number;
}

export interface MenuItem {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  price: number;
  taxRate: number; // e.g., 5, 12, 18, 8.25, 10, 21
  station: KotStation;
  dietary: 'veg' | 'non_veg' | 'vegan';
  imageUrl?: string;
  modifierGroupIds: string[];
  available: boolean;
  seasonalMenuId?: string;
  availableFrom?: string; // HH:mm
  availableTo?: string;   // HH:mm
  recipe: RecipeIngredientUsage[];
  lastCostPerUnit: number;
  priceHistory: { date: string; oldPrice: number; newPrice: number; reason: string }[];
}

export interface ComboBundle {
  id: string;
  name: string;
  description: string;
  itemIds: string[];
  comboPrice: number;
  active: boolean;
}

export interface SeasonalMenu {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  active: boolean;
}

export interface FloorLayout {
  id: string;
  branchId: string;
  name: string;
}

export interface RestaurantTable {
  id: string;
  branchId: string;
  layoutId: string;
  label: string;
  seats: number;
  x: number;
  y: number;
  shape: TableShape;
  status: TableStatus;
  sessionCode: string; // Live 4-digit staff-opened code required for QR orders
  sessionCodeActive: boolean;
  buzzerNumber?: string;
  buzzerActive?: boolean;
  currentOrderId?: string;
  waiterAlert?: boolean;
  billAlert?: boolean;
}

export interface Reservation {
  id: string;
  branchId: string;
  customerName: string;
  phone: string;
  partySize: number;
  dateTime: string;
  tableId?: string;
  status: 'confirmed' | 'seated' | 'cancelled' | 'no_show';
  notes?: string;
}

export interface WaitlistEntry {
  id: string;
  branchId: string;
  customerName: string;
  phone: string;
  partySize: number;
  quotedMinutes: number;
  buzzerNumber?: string;
  createdAt: string;
  status: 'waiting' | 'paged' | 'seated' | 'left';
}

export interface OrderItem {
  id: string;
  menuItemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  station: KotStation;
  modifiers: { name: string; priceDelta: number }[];
  notes?: string;
}

export interface TaxLine {
  label: string;
  rate: number;
  amount: number;
}

export interface PaymentRecord {
  id: string;
  method: TenderMethod;
  amount: number;
  reference?: string;
  paidAt: string;
}

export interface RefundRecord {
  id: string;
  amount: number;
  reason: string;
  method: TenderMethod;
  processedBy: string;
  refundedAt: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  branchId: string;
  channel: OrderChannel;
  status: OrderStatus;
  tableId?: string;
  tableLabel?: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  deliveryPincode?: string;
  driverId?: string;
  deliveryStatus?: 'unassigned' | 'assigned' | 'out_for_delivery' | 'delivered';
  scheduledFor?: string;
  idempotencyKey?: string;
  payMode?: 'pay_at_register' | 'pay_on_phone';
  items: OrderItem[];
  subtotal: number;
  discountAmount: number;
  couponCode?: string;
  referralCode?: string;
  giftCardCode?: string;
  giftCardRedeemed: number;
  loyaltyPointsRedeemed: number;
  serviceCharge: number;
  deliveryFee: number;
  tipAmount: number;
  taxTotal: number;
  taxBreakdown: TaxLine[];
  grandTotal: number;
  paidTotal: number;
  payments: PaymentRecord[];
  refunds: RefundRecord[];
  splitCount: number;
  staffId?: string;
  staffName?: string;
  rating?: { score: number; comment: string; createdAt: string };
  createdAt: string;
  updatedAt: string;
}

export interface KotTicket {
  id: string;
  kotNumber: string;
  orderId: string;
  orderNumber: string;
  branchId: string;
  tableLabel: string;
  channel: OrderChannel;
  station: KotStation;
  status: KotStatus;
  items: OrderItem[];
  createdAt: string;
  startedAt?: string;
  readyAt?: string;
  servedAt?: string;
}

export interface StockArea {
  id: string;
  branchId: string;
  name: string;
}

export interface Ingredient {
  id: string;
  branchId: string;
  name: string;
  sku: string;
  unit: 'kg' | 'g' | 'L' | 'ml' | 'pcs';
  areaId: string;
  quantityOnHand: number;
  parLevel: number;
  unitCost: number;
  batchNumber: string;
  expiryDate: string;
}

export interface StockJournalEntry {
  id: string;
  branchId: string;
  ingredientId: string;
  ingredientName: string;
  type: 'sale_deduction' | 'grn_receipt' | 'production_consume' | 'transfer' | 'waste' | 'stock_take_adj';
  delta: number;
  unitCost: number;
  reference: string;
  createdAt: string;
}

export interface ProductionRun {
  id: string;
  branchId: string;
  menuItemId: string;
  menuItemName: string;
  unitsProduced: number;
  ingredientUsages: { ingredientId: string; ingredientName: string; qtyUsed: number; cost: number }[];
  materialCost: number;
  extraCosts: number; // labor, fuel, packaging
  totalCost: number;
  costPerUnit: number;
  updatedMenuPrice?: number;
  createdAt: string;
}

export interface WasteLog {
  id: string;
  branchId: string;
  ingredientId: string;
  ingredientName: string;
  quantity: number;
  costValue: number;
  reason: 'Spoilage' | 'Prep Error' | 'Expired' | 'Customer Return';
  loggedBy: string;
  createdAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  contactName: string;
  phone: string;
  email: string;
  gstin?: string;
  category: string;
  onTimeRate: number;
  qualityScore: number;
  balanceDue: number;
}

export interface VendorQuotation {
  id: string;
  supplierId: string;
  supplierName: string;
  ingredientName: string;
  quotedPrice: number;
  unit: string;
  leadTimeDays: number;
  status: 'pending' | 'selected' | 'rejected';
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  branchId: string;
  supplierId: string;
  supplierName: string;
  status: 'draft' | 'approved' | 'sent' | 'received' | 'returned';
  items: { ingredientId: string; ingredientName: string; qty: number; unitPrice: number }[];
  totalAmount: number;
  expectedDate: string;
  createdAt: string;
}

export interface GrnRecord {
  id: string;
  grnNumber: string;
  poId: string;
  branchId: string;
  supplierName: string;
  receivedItems: { ingredientId: string; ingredientName: string; qtyReceived: number; unitCost: number; batchNumber: string; expiryDate: string }[];
  invoiceNumber: string;
  invoiceAmount: number;
  priceVariance: number;
  paid: boolean;
  createdAt: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  loyaltyPoints: number;
  referralCode: string;
  referredBy?: string;
  membershipTier: 'Standard' | 'Silver' | 'Gold';
  totalVisits: number;
  totalSpent: number;
  marketingOptOut: boolean;
  lastVisitAt: string;
}

export interface GiftVoucher {
  id: string;
  code: string;
  initialAmount: number;
  balance: number;
  issuedTo: string;
  expiresAt: string;
  active: boolean;
}

export interface AttendanceLog {
  id: string;
  branchId: string;
  staffId: string;
  staffName: string;
  date: string;
  clockIn: string;
  clockOut?: string;
  breakMinutes: number;
  lateMinutes: number;
  offlineSynced?: boolean;
}

export interface ShiftSchedule {
  id: string;
  branchId: string;
  staffId: string;
  staffName: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  station: string;
}

export interface LeaveRequest {
  id: string;
  staffId: string;
  staffName: string;
  fromDate: string;
  toDate: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
}

export interface Payslip {
  id: string;
  branchId: string;
  staffId: string;
  staffName: string;
  periodLabel: string;
  regularHours: number;
  overtimeHours: number;
  basePay: number;
  overtimePay: number;
  tipPoolShare: number;
  lateDeductions: number;
  netPay: number;
  generatedAt: string;
}

export interface Expense {
  id: string;
  branchId: string;
  category: string;
  description: string;
  amount: number;
  taxAmount: number;
  status: 'submitted' | 'approved' | 'rejected' | 'posted';
  isPettyCash: boolean;
  submittedBy: string;
  date: string;
}

export interface CashClosing {
  id: string;
  branchId: string;
  date: string;
  openingFloat: number;
  expectedCash: number;
  countedCash: number;
  variance: number;
  denominations: Record<string, number>;
  closedBy: string;
  notes?: string;
}

export interface BudgetLine {
  id: string;
  branchId: string;
  month: string;
  category: string;
  budgetAmount: number;
}

export interface BankStatementEntry {
  id: string;
  branchId: string;
  date: string;
  description: string;
  amount: number;
  type: 'credit' | 'debit';
  reconciled: boolean;
}

export interface DeliveryZone {
  id: string;
  branchId: string;
  pincode: string;
  areaName: string;
  deliveryFee: number;
  minOrder: number;
  etaMinutes: number;
  active: boolean;
}

export interface Driver {
  id: string;
  branchId: string;
  name: string;
  phone: string;
  vehicleNumber: string;
  status: 'available' | 'on_delivery' | 'off_duty';
}

export interface EquipmentItem {
  id: string;
  branchId: string;
  name: string;
  serialNumber: string;
  location: string;
  warrantyUntil: string;
  lastServiceDate: string;
  nextServiceDue: string;
  vendorPhone: string;
}

export interface DocumentItem {
  id: string;
  branchId: string;
  title: string;
  category: 'SOP' | 'Contract' | 'Recipe' | 'Purchase Paperwork';
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  contentPreview: string;
  uploadedBy: string;
  createdAt: string;
}

export interface Coupon {
  id: string;
  code: string;
  type: 'percent' | 'flat';
  value: number;
  minSpend: number;
  usesCount: number;
  maxUses: number;
  active: boolean;
}

export interface HappyHourRule {
  id: string;
  name: string;
  days: string;
  startTime: string;
  endTime: string;
  discountPercent: number;
  active: boolean;
}

export interface Campaign {
  id: string;
  title: string;
  channel: 'email' | 'sms' | 'whatsapp';
  audienceCount: number;
  optedOutSkipped: number;
  message: string;
  sentAt: string;
}

export interface WebhookConfig {
  id: string;
  url: string;
  events: string[];
  secret: string;
  active: boolean;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: string;
  statusCode: number;
  signature: string;
  deliveredAt: string;
}

export interface AuditLog {
  id: string;
  actorName: string;
  action: string;
  target: string;
  details: string;
  createdAt: string;
}

export interface ScheduledReport {
  id: string;
  reportName: string;
  recipientEmail: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  format: 'CSV' | 'Excel' | 'PDF';
  active: boolean;
}

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  fromEmail: string;
  configured: boolean;
}

export interface AppDatabase {
  branches: Branch[];
  roles: Role[];
  staff: StaffUser[];
  categories: Category[];
  modifierGroups: ModifierGroup[];
  menuItems: MenuItem[];
  combos: ComboBundle[];
  seasonalMenus: SeasonalMenu[];
  floorLayouts: FloorLayout[];
  tables: RestaurantTable[];
  reservations: Reservation[];
  waitlist: WaitlistEntry[];
  orders: Order[];
  kots: KotTicket[];
  stockAreas: StockArea[];
  ingredients: Ingredient[];
  stockJournal: StockJournalEntry[];
  productionRuns: ProductionRun[];
  wasteLogs: WasteLog[];
  suppliers: Supplier[];
  quotations: VendorQuotation[];
  purchaseOrders: PurchaseOrder[];
  grns: GrnRecord[];
  customers: Customer[];
  giftVouchers: GiftVoucher[];
  attendance: AttendanceLog[];
  shifts: ShiftSchedule[];
  leaves: LeaveRequest[];
  payslips: Payslip[];
  expenses: Expense[];
  cashClosings: CashClosing[];
  budgets: BudgetLine[];
  bankEntries: BankStatementEntry[];
  deliveryZones: DeliveryZone[];
  drivers: Driver[];
  equipment: EquipmentItem[];
  documents: DocumentItem[];
  coupons: Coupon[];
  happyHours: HappyHourRule[];
  campaigns: Campaign[];
  webhooks: WebhookConfig[];
  webhookDeliveries: WebhookDelivery[];
  scheduledReports: ScheduledReport[];
  auditLogs: AuditLog[];
  smtpConfig: SmtpConfig;
  securitySettings: {
    sessionTimeoutMinutes: number;
    requirePinOnOrderVoid: boolean;
    interstateIgstEnabled: boolean;
  };
}

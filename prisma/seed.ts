import { config as loadEnvironment } from 'dotenv'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { createClient, type User } from '@supabase/supabase-js'
import { z } from 'zod'
import { normalizeEmail, normalizeLoginId, passwordSchema } from '../src/lib/auth/credentials'
import type { Actor } from '../src/lib/contracts/access'
import type { ActionResult } from '../src/lib/contracts/errors'
import { capabilitiesByRole } from '../src/server/access/permissions'
import { postManualJournal, postOpeningJournal } from '../src/server/accounting'
import { createBudget } from '../src/server/budgets'
import { getPrisma } from '../src/server/db/prisma'
import {
	confirmPurchaseOrder,
	createPurchaseOrder,
	createVendorBillFromPurchaseOrder,
	postVendorBill,
	receivePurchaseOrder
} from '../src/server/purchasing'
import { recordCustomerPayment, recordVendorPayment, reversePayment } from '../src/server/payments'
import {
	confirmSalesOrder,
	createCustomerInvoiceFromSalesOrder,
	createSalesOrder,
	deliverSalesOrder,
	postCustomerInvoice
} from '../src/server/sales'

loadEnvironment({ path: '.env.local', quiet: true })

const seedEnvironmentSchema = z.object({
	DATABASE_URL: z.string().min(1),
	NEXT_PUBLIC_SUPABASE_URL: z.url(),
	SUPABASE_SECRET_KEY: z.string().min(20),
	URBANLEDGER_ENV: z.literal('local'),
	URBANLEDGER_SEED_ADMIN_PASSWORD: passwordSchema,
	URBANLEDGER_SEED_ACCOUNTANT_PASSWORD: passwordSchema,
	URBANLEDGER_SEED_CUSTOMER_PASSWORD: passwordSchema,
	URBANLEDGER_SEED_VENDOR_PASSWORD: passwordSchema
})

const environment = seedEnvironmentSchema.parse(process.env)
const adapter = new PrismaPg({ connectionString: environment.DATABASE_URL }, { schema: 'app' })
const prisma = new PrismaClient({ adapter })
const supabase = createClient(
	environment.NEXT_PUBLIC_SUPABASE_URL,
	environment.SUPABASE_SECRET_KEY,
	{ auth: { autoRefreshToken: false, persistSession: false } }
)

const ids = {
	business: '10000000-0000-4000-8000-000000000001',
	adminUser: '11000000-0000-4000-8000-000000000001',
	accountantUser: '11000000-0000-4000-8000-000000000002',
	customerUser: '11000000-0000-4000-8000-000000000003',
	vendorUser: '11000000-0000-4000-8000-000000000004',
	adminGrant: '12000000-0000-4000-8000-000000000001',
	accountantGrant: '12000000-0000-4000-8000-000000000002',
	customerAccess: '13000000-0000-4000-8000-000000000001',
	vendorAccess: '13000000-0000-4000-8000-000000000002',
	customer: '20000000-0000-4000-8000-000000000001',
	vendor: '20000000-0000-4000-8000-000000000002',
	secondCustomer: '20000000-0000-4000-8000-000000000003',
	category: '30000000-0000-4000-8000-000000000001',
	chair: '31000000-0000-4000-8000-000000000001',
	design: '31000000-0000-4000-8000-000000000002',
	diningSet: '31000000-0000-4000-8000-000000000003',
	bank: '40000000-0000-4000-8000-000000000001',
	cash: '40000000-0000-4000-8000-000000000002',
	receivable: '40000000-0000-4000-8000-000000000003',
	payable: '40000000-0000-4000-8000-000000000004',
	sales: '40000000-0000-4000-8000-000000000005',
	purchases: '40000000-0000-4000-8000-000000000006',
	capital: '40000000-0000-4000-8000-000000000007',
	inputTax: '40000000-0000-4000-8000-000000000008',
	outputTax: '40000000-0000-4000-8000-000000000009',
	salesJournal: '50000000-0000-4000-8000-000000000001',
	purchaseJournal: '50000000-0000-4000-8000-000000000002',
	bankJournal: '50000000-0000-4000-8000-000000000003',
	cashJournal: '50000000-0000-4000-8000-000000000004',
	openingJournal: '50000000-0000-4000-8000-000000000005',
	generalJournal: '50000000-0000-4000-8000-000000000006',
	tax: '60000000-0000-4000-8000-000000000001',
	analytic: '70000000-0000-4000-8000-000000000001',
	incomeAnalytic: '70000000-0000-4000-8000-000000000002',
	budget: '71000000-0000-4000-8000-000000000001',
	budgetLine: '72000000-0000-4000-8000-000000000001'
} as const

const identities = [
	{
		id: ids.adminUser,
		loginId: 'uladmin',
		email: 'owner@urbanledger.test',
		displayName: 'Riya Sharma',
		password: environment.URBANLEDGER_SEED_ADMIN_PASSWORD
	},
	{
		id: ids.accountantUser,
		loginId: 'ulacct',
		email: 'accounts@urbanledger.test',
		displayName: 'Kabir Malhotra',
		password: environment.URBANLEDGER_SEED_ACCOUNTANT_PASSWORD
	},
	{
		id: ids.customerUser,
		loginId: 'ulcust',
		email: 'aarav@urbanledger.test',
		displayName: 'Aarav Mehta',
		password: environment.URBANLEDGER_SEED_CUSTOMER_PASSWORD
	},
	{
		id: ids.vendorUser,
		loginId: 'ulvend',
		email: 'orders@narmadatimber.test',
		displayName: 'Narmada Timber Works',
		password: environment.URBANLEDGER_SEED_VENDOR_PASSWORD
	}
] as const

const activityOperationKeys = {
	confirmedPurchaseOrder: '81000000-0000-4000-8000-000000000001',
	confirmPurchaseOrder: '81000000-0000-4000-8000-000000000002',
	draftPurchaseOrder: '81000000-0000-4000-8000-000000000003',
	openingBalance: '81000000-0000-4000-8000-000000000004',
	manualExpense: '81000000-0000-4000-8000-000000000005',
	showcasePurchaseOrder: '82000000-0000-4000-8000-000000000001',
	showcasePurchaseConfirm: '82000000-0000-4000-8000-000000000002',
	showcasePurchaseReceipt: '82000000-0000-4000-8000-000000000003',
	showcaseVendorBill: '82000000-0000-4000-8000-000000000004',
	showcaseVendorBillPost: '82000000-0000-4000-8000-000000000005',
	showcaseVendorPayment: '82000000-0000-4000-8000-000000000006',
	showcaseVendorPaymentReverse: '82000000-0000-4000-8000-000000000007',
	paidSalesOrder: '83000000-0000-4000-8000-000000000001',
	paidSalesConfirm: '83000000-0000-4000-8000-000000000002',
	paidSalesDelivery: '83000000-0000-4000-8000-000000000003',
	paidInvoice: '83000000-0000-4000-8000-000000000004',
	paidInvoicePost: '83000000-0000-4000-8000-000000000005',
	paidCustomerPayment: '83000000-0000-4000-8000-000000000006',
	partialSalesOrder: '84000000-0000-4000-8000-000000000001',
	partialSalesConfirm: '84000000-0000-4000-8000-000000000002',
	partialSalesDelivery: '84000000-0000-4000-8000-000000000003',
	partialInvoice: '84000000-0000-4000-8000-000000000004',
	partialInvoicePost: '84000000-0000-4000-8000-000000000005',
	partialCustomerPayment: '84000000-0000-4000-8000-000000000006',
	unpaidSalesOrder: '85000000-0000-4000-8000-000000000001',
	unpaidSalesConfirm: '85000000-0000-4000-8000-000000000002',
	unpaidInvoice: '85000000-0000-4000-8000-000000000003',
	unpaidInvoicePost: '85000000-0000-4000-8000-000000000004',
	incomeBudget: '86000000-0000-4000-8000-000000000001'
} as const

function requireCommandResult<T>(result: ActionResult<T>) {
	if (!result.ok) {
		throw new Error(`${result.error.code}: ${result.error.message}`)
	}

	return result.data
}

async function seedRepresentativeActivity(providerUserId: string) {
	const actor: Actor = {
		userId: ids.accountantUser,
		providerUserId,
		businessId: ids.business,
		role: 'ACCOUNTANT',
		contactId: null,
		displayName: 'Kabir Malhotra',
		capabilities: capabilitiesByRole.ACCOUNTANT
	}
	const confirmedOrder = requireCommandResult(
		await createPurchaseOrder(actor, {
			operationKey: activityOperationKeys.confirmedPurchaseOrder,
			vendorId: ids.vendor,
			orderDate: '2026-08-02',
			lines: [{ productId: ids.chair, quantity: '5', unitPrice: '5000.0000' }]
		})
	)

	requireCommandResult(
		await confirmPurchaseOrder(actor, {
			operationKey: activityOperationKeys.confirmPurchaseOrder,
			purchaseOrderId: confirmedOrder.id,
			expectedRevision: 1
		})
	)

	requireCommandResult(
		await createPurchaseOrder(actor, {
			operationKey: activityOperationKeys.draftPurchaseOrder,
			vendorId: ids.vendor,
			orderDate: '2026-08-06',
			lines: [{ productId: ids.diningSet, quantity: '1', unitPrice: '32000.0000' }]
		})
	)

	requireCommandResult(
		await postOpeningJournal(actor, {
			operationKey: activityOperationKeys.openingBalance,
			journalId: ids.openingJournal,
			postingDate: '2026-08-01',
			memo: 'Owner capital introduced',
			lines: [
				{
					accountId: ids.bank,
					description: 'Owner capital introduced',
					debit: '100000.00',
					credit: '0'
				},
				{
					accountId: ids.capital,
					description: 'Owner capital introduced',
					debit: '0',
					credit: '100000.00'
				}
			]
		})
	)

	requireCommandResult(
		await postManualJournal(actor, {
			operationKey: activityOperationKeys.manualExpense,
			journalId: ids.generalJournal,
			postingDate: '2026-08-03',
			memo: 'Workshop supplies purchased',
			lines: [
				{
					accountId: ids.purchases,
					description: 'Workshop supplies purchased',
					debit: '5000.00',
					credit: '0'
				},
				{
					accountId: ids.bank,
					description: 'Workshop supplies purchased',
					debit: '0',
					credit: '5000.00'
				}
			]
		})
	)
}

async function seedShowcaseActivity(providerUserId: string) {
	const actor: Actor = {
		userId: ids.accountantUser,
		providerUserId,
		businessId: ids.business,
		role: 'ACCOUNTANT',
		contactId: null,
		displayName: 'Kabir Malhotra',
		capabilities: capabilitiesByRole.ACCOUNTANT
	}

	requireCommandResult(
		await createBudget(actor, {
			operationKey: activityOperationKeys.incomeBudget,
			name: 'Sales Growth 2026',
			startsOn: '2026-04-01',
			endsOn: '2027-03-31',
			responsibleUserId: ids.accountantUser,
			lines: [{ analyticAccountId: ids.incomeAnalytic, plannedAmount: '750000.00' }]
		})
	)

	const purchaseOrder = requireCommandResult(
		await createPurchaseOrder(actor, {
			operationKey: activityOperationKeys.showcasePurchaseOrder,
			vendorId: ids.vendor,
			orderDate: '2026-05-01',
			lines: [
				{
					productId: ids.chair,
					quantity: '10',
					unitPrice: '5000.0000',
					taxId: ids.tax,
					analyticAccountId: ids.analytic
				}
			]
		})
	)
	const confirmedPurchaseOrder = requireCommandResult(
		await confirmPurchaseOrder(actor, {
			operationKey: activityOperationKeys.showcasePurchaseConfirm,
			purchaseOrderId: purchaseOrder.id,
			expectedRevision: 1
		})
	)
	requireCommandResult(
		await receivePurchaseOrder(actor, {
			operationKey: activityOperationKeys.showcasePurchaseReceipt,
			purchaseOrderId: confirmedPurchaseOrder.id,
			expectedRevision: 2,
			receiptDate: '2026-05-02'
		})
	)
	const vendorBill = requireCommandResult(
		await createVendorBillFromPurchaseOrder(actor, {
			operationKey: activityOperationKeys.showcaseVendorBill,
			purchaseOrderId: confirmedPurchaseOrder.id,
			expectedPurchaseOrderRevision: 3,
			billDate: '2026-05-03',
			dueDate: '2026-05-31',
			vendorReference: 'NTW-2026-051'
		})
	)
	const postedVendorBill = requireCommandResult(
		await postVendorBill(actor, {
			operationKey: activityOperationKeys.showcaseVendorBillPost,
			vendorBillId: vendorBill.id,
			expectedRevision: 1,
			journalId: ids.purchaseJournal
		})
	)
	const vendorPayment = requireCommandResult(
		await recordVendorPayment(actor, {
			operationKey: activityOperationKeys.showcaseVendorPayment,
			documentId: postedVendorBill.id,
			expectedDocumentRevision: 2,
			journalId: ids.bankJournal,
			paymentDate: '2026-05-12',
			amount: postedVendorBill.total,
			reference: 'Bank transfer to Narmada Timber Works'
		})
	)
	requireCommandResult(
		await reversePayment(actor, {
			operationKey: activityOperationKeys.showcaseVendorPaymentReverse,
			paymentId: vendorPayment.id,
			expectedRevision: 1,
			reversalDate: '2026-08-28',
			reason: 'Vendor transfer returned by bank'
		})
	)

	const paidOrder = requireCommandResult(
		await createSalesOrder(actor, {
			operationKey: activityOperationKeys.paidSalesOrder,
			customerId: ids.customer,
			orderDate: '2026-05-05',
			lines: [
				{
					productId: ids.chair,
					quantity: '2',
					unitPrice: '7500.0000',
					taxId: ids.tax,
					analyticAccountId: ids.incomeAnalytic
				}
			]
		})
	)
	const confirmedPaidOrder = requireCommandResult(
		await confirmSalesOrder(actor, {
			operationKey: activityOperationKeys.paidSalesConfirm,
			salesOrderId: paidOrder.id,
			expectedRevision: 1
		})
	)
	requireCommandResult(
		await deliverSalesOrder(actor, {
			operationKey: activityOperationKeys.paidSalesDelivery,
			salesOrderId: confirmedPaidOrder.id,
			expectedRevision: 2,
			deliveryDate: '2026-05-06'
		})
	)
	const paidInvoice = requireCommandResult(
		await createCustomerInvoiceFromSalesOrder(actor, {
			operationKey: activityOperationKeys.paidInvoice,
			salesOrderId: confirmedPaidOrder.id,
			expectedSalesOrderRevision: 3,
			invoiceDate: '2026-05-06',
			dueDate: '2026-05-20',
			reference: 'Office seating delivery'
		})
	)
	const postedPaidInvoice = requireCommandResult(
		await postCustomerInvoice(actor, {
			operationKey: activityOperationKeys.paidInvoicePost,
			customerInvoiceId: paidInvoice.id,
			expectedRevision: 1,
			journalId: ids.salesJournal
		})
	)
	requireCommandResult(
		await recordCustomerPayment(actor, {
			operationKey: activityOperationKeys.paidCustomerPayment,
			documentId: postedPaidInvoice.id,
			expectedDocumentRevision: 2,
			journalId: ids.bankJournal,
			paymentDate: '2026-05-10',
			amount: postedPaidInvoice.total,
			reference: 'Customer bank receipt'
		})
	)

	const partialOrder = requireCommandResult(
		await createSalesOrder(actor, {
			operationKey: activityOperationKeys.partialSalesOrder,
			customerId: ids.customer,
			orderDate: '2026-06-10',
			lines: [
				{
					productId: ids.design,
					quantity: '1',
					unitPrice: '12000.0000',
					taxId: ids.tax,
					analyticAccountId: ids.incomeAnalytic
				}
			]
		})
	)
	const confirmedPartialOrder = requireCommandResult(
		await confirmSalesOrder(actor, {
			operationKey: activityOperationKeys.partialSalesConfirm,
			salesOrderId: partialOrder.id,
			expectedRevision: 1
		})
	)
	requireCommandResult(
		await deliverSalesOrder(actor, {
			operationKey: activityOperationKeys.partialSalesDelivery,
			salesOrderId: confirmedPartialOrder.id,
			expectedRevision: 2,
			deliveryDate: '2026-06-11'
		})
	)
	const partialInvoice = requireCommandResult(
		await createCustomerInvoiceFromSalesOrder(actor, {
			operationKey: activityOperationKeys.partialInvoice,
			salesOrderId: confirmedPartialOrder.id,
			expectedSalesOrderRevision: 3,
			invoiceDate: '2026-06-11',
			dueDate: '2026-06-30',
			reference: 'Workspace planning engagement'
		})
	)
	const postedPartialInvoice = requireCommandResult(
		await postCustomerInvoice(actor, {
			operationKey: activityOperationKeys.partialInvoicePost,
			customerInvoiceId: partialInvoice.id,
			expectedRevision: 1,
			journalId: ids.salesJournal
		})
	)
	requireCommandResult(
		await recordCustomerPayment(actor, {
			operationKey: activityOperationKeys.partialCustomerPayment,
			documentId: postedPartialInvoice.id,
			expectedDocumentRevision: 2,
			journalId: ids.bankJournal,
			paymentDate: '2026-06-15',
			amount: '4000.00',
			reference: 'Part payment received'
		})
	)

	const unpaidOrder = requireCommandResult(
		await createSalesOrder(actor, {
			operationKey: activityOperationKeys.unpaidSalesOrder,
			customerId: ids.secondCustomer,
			orderDate: '2026-07-10',
			lines: [
				{
					productId: ids.diningSet,
					quantity: '1',
					unitPrice: '48000.0000',
					taxId: ids.tax,
					analyticAccountId: ids.incomeAnalytic
				}
			]
		})
	)
	const confirmedUnpaidOrder = requireCommandResult(
		await confirmSalesOrder(actor, {
			operationKey: activityOperationKeys.unpaidSalesConfirm,
			salesOrderId: unpaidOrder.id,
			expectedRevision: 1
		})
	)
	const unpaidInvoice = requireCommandResult(
		await createCustomerInvoiceFromSalesOrder(actor, {
			operationKey: activityOperationKeys.unpaidInvoice,
			salesOrderId: confirmedUnpaidOrder.id,
			expectedSalesOrderRevision: 2,
			invoiceDate: '2026-07-10',
			dueDate: '2026-07-31',
			reference: 'Dining room furnishing order'
		})
	)
	requireCommandResult(
		await postCustomerInvoice(actor, {
			operationKey: activityOperationKeys.unpaidInvoicePost,
			customerInvoiceId: unpaidInvoice.id,
			expectedRevision: 1,
			journalId: ids.salesJournal
		})
	)
}

async function findAuthUser(email: string) {
	for (let page = 1; ; page += 1) {
		const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 })

		if (error) {
			throw error
		}

		const user = data.users.find((candidate) => normalizeEmail(candidate.email ?? '') === email)

		if (user) {
			return user
		}

		if (data.users.length < 100) {
			return null
		}
	}
}

async function upsertAuthUser(identity: (typeof identities)[number]): Promise<User> {
	const email = normalizeEmail(identity.email)
	const existing = await findAuthUser(email)

	if (existing && existing.app_metadata.urbanledgerSeedProfile !== 'showcase') {
		throw new Error(`Refusing to adopt existing Auth identity for ${identity.loginId}.`)
	}

	if (existing) {
		const { data, error } = await supabase.auth.admin.updateUserById(existing.id, {
			password: identity.password,
			email_confirm: true,
			user_metadata: { displayName: identity.displayName },
			app_metadata: { ...existing.app_metadata, urbanledgerSeedProfile: 'showcase' }
		})

		if (error) {
			throw error
		}

		return data.user
	}

	const { data, error } = await supabase.auth.admin.createUser({
		email,
		password: identity.password,
		email_confirm: true,
		user_metadata: { displayName: identity.displayName },
		app_metadata: { urbanledgerSeedProfile: 'showcase' }
	})

	if (error) {
		throw error
	}

	return data.user
}

async function seed() {
	const authUsers = new Map<string, User>()

	for (const identity of identities) {
		authUsers.set(identity.loginId, await upsertAuthUser(identity))
	}

	await prisma.$transaction(async (transaction) => {
		await transaction.business.upsert({
			where: { id: ids.business },
			update: {},
			create: {
				id: ids.business,
				slug: 'urbanledger',
				name: 'UrbanLedger Furnishings',
				currency: 'INR',
				timezone: 'Asia/Kolkata',
				fiscalYearStartMonth: 4,
				fiscalYearStartDay: 1,
				readyAt: new Date()
			}
		})

		for (const identity of identities) {
			const authUser = authUsers.get(identity.loginId)

			if (!authUser) {
				throw new Error(`Missing Auth identity for ${identity.loginId}.`)
			}

			await transaction.applicationUser.upsert({
				where: { id: identity.id },
				update: {
					providerUserId: authUser.id,
					loginId: identity.loginId,
					normalizedLoginId: normalizeLoginId(identity.loginId),
					normalizedEmail: normalizeEmail(identity.email),
					displayName: identity.displayName,
					status: 'ACTIVE',
					disabledAt: null
				},
				create: {
					id: identity.id,
					providerUserId: authUser.id,
					loginId: identity.loginId,
					normalizedLoginId: normalizeLoginId(identity.loginId),
					normalizedEmail: normalizeEmail(identity.email),
					displayName: identity.displayName,
					status: 'ACTIVE'
				}
			})
		}

		await transaction.contact.upsert({
			where: { id: ids.customer },
			update: {},
			create: {
				id: ids.customer,
				businessId: ids.business,
				kind: 'CUSTOMER',
				name: 'Aarav Mehta',
				email: 'aarav@urbanledger.test',
				mobile: '09876543210',
				street: '18 Lake View Road',
				city: 'Pune',
				state: 'Maharashtra',
				pincode: '411001'
			}
		})

		await transaction.contact.upsert({
			where: { id: ids.vendor },
			update: {},
			create: {
				id: ids.vendor,
				businessId: ids.business,
				kind: 'VENDOR',
				name: 'Narmada Timber Works',
				email: 'orders@narmadatimber.test',
				mobile: '07940001234',
				street: '42 Industrial Estate',
				city: 'Ahmedabad',
				state: 'Gujarat',
				pincode: '380015'
			}
		})

		await transaction.contact.upsert({
			where: { id: ids.secondCustomer },
			update: {},
			create: {
				id: ids.secondCustomer,
				businessId: ids.business,
				kind: 'CUSTOMER',
				name: 'Kavya Interiors',
				email: 'office@kavyainteriors.test',
				city: 'Bengaluru',
				state: 'Karnataka',
				pincode: '560001'
			}
		})

		await transaction.staffGrant.upsert({
			where: {
				userId_businessId_role: {
					userId: ids.adminUser,
					businessId: ids.business,
					role: 'ADMIN'
				}
			},
			update: { revokedAt: null, validUntil: null },
			create: {
				id: ids.adminGrant,
				userId: ids.adminUser,
				businessId: ids.business,
				role: 'ADMIN'
			}
		})

		await transaction.staffGrant.upsert({
			where: {
				userId_businessId_role: {
					userId: ids.accountantUser,
					businessId: ids.business,
					role: 'ACCOUNTANT'
				}
			},
			update: { revokedAt: null, validUntil: null },
			create: {
				id: ids.accountantGrant,
				userId: ids.accountantUser,
				businessId: ids.business,
				role: 'ACCOUNTANT'
			}
		})

		await transaction.portalAccess.upsert({
			where: { userId: ids.customerUser },
			update: { contactId: ids.customer, status: 'ACTIVE', revokedAt: null },
			create: {
				id: ids.customerAccess,
				userId: ids.customerUser,
				businessId: ids.business,
				contactId: ids.customer
			}
		})

		await transaction.portalAccess.upsert({
			where: { userId: ids.vendorUser },
			update: { contactId: ids.vendor, status: 'ACTIVE', revokedAt: null },
			create: {
				id: ids.vendorAccess,
				userId: ids.vendorUser,
				businessId: ids.business,
				contactId: ids.vendor
			}
		})

		await transaction.productCategory.upsert({
			where: { id: ids.category },
			update: {},
			create: { id: ids.category, businessId: ids.business, name: 'Furniture' }
		})

		const products = [
			{
				id: ids.chair,
				name: 'Ergonomic Office Chair',
				sku: 'CHAIR-ERG-01',
				kind: 'GOODS' as const,
				salesPrice: '7500.0000',
				purchaseCost: '5000.0000'
			},
			{
				id: ids.design,
				name: 'Workspace Design Consultation',
				sku: 'SERVICE-DESIGN-01',
				kind: 'SERVICE' as const,
				salesPrice: '12000.0000',
				purchaseCost: '0.0000'
			},
			{
				id: ids.diningSet,
				name: 'Six Seat Dining Set',
				sku: 'COMBO-DINING-06',
				kind: 'COMBO' as const,
				salesPrice: '48000.0000',
				purchaseCost: '32000.0000'
			}
		]

		for (const product of products) {
			await transaction.product.upsert({
				where: { id: product.id },
				update: {},
				create: {
					...product,
					businessId: ids.business,
					categoryId: ids.category
				}
			})
		}

		const accounts = [
			{
				id: ids.bank,
				code: '1000',
				name: 'Bank',
				type: 'ASSET' as const,
				subtype: 'BANK' as const
			},
			{
				id: ids.cash,
				code: '1010',
				name: 'Cash',
				type: 'ASSET' as const,
				subtype: 'CASH' as const
			},
			{
				id: ids.receivable,
				code: '1100',
				name: 'Debtors',
				type: 'ASSET' as const,
				subtype: 'RECEIVABLE' as const
			},
			{
				id: ids.payable,
				code: '2000',
				name: 'Creditors',
				type: 'LIABILITY' as const,
				subtype: 'PAYABLE' as const
			},
			{
				id: ids.sales,
				code: '4000',
				name: 'Sales Income',
				type: 'INCOME' as const,
				subtype: 'GENERAL' as const
			},
			{
				id: ids.purchases,
				code: '5000',
				name: 'Purchase Expense',
				type: 'EXPENSE' as const,
				subtype: 'GENERAL' as const
			},
			{
				id: ids.capital,
				code: '3000',
				name: 'Capital',
				type: 'CAPITAL' as const,
				subtype: 'GENERAL' as const
			},
			{
				id: ids.inputTax,
				code: '1200',
				name: 'Input Tax',
				type: 'ASSET' as const,
				subtype: 'INPUT_TAX' as const
			},
			{
				id: ids.outputTax,
				code: '2100',
				name: 'Output Tax',
				type: 'LIABILITY' as const,
				subtype: 'OUTPUT_TAX' as const
			}
		]

		for (const account of accounts) {
			await transaction.ledgerAccount.upsert({
				where: { id: account.id },
				update: {},
				create: { ...account, businessId: ids.business }
			})
		}

		const journals = [
			{
				id: ids.salesJournal,
				code: 'SAL',
				name: 'Sales',
				type: 'SALES' as const,
				defaultIncomeAccountId: ids.sales,
				defaultControlAccountId: ids.receivable
			},
			{
				id: ids.purchaseJournal,
				code: 'PUR',
				name: 'Purchases',
				type: 'PURCHASE' as const,
				defaultExpenseAccountId: ids.purchases,
				defaultControlAccountId: ids.payable
			},
			{
				id: ids.bankJournal,
				code: 'BNK',
				name: 'Bank',
				type: 'BANK' as const,
				defaultLiquidityAccountId: ids.bank
			},
			{
				id: ids.cashJournal,
				code: 'CSH',
				name: 'Cash',
				type: 'CASH' as const,
				defaultLiquidityAccountId: ids.cash
			},
			{
				id: ids.openingJournal,
				code: 'OPN',
				name: 'Opening Balances',
				type: 'OPENING' as const
			},
			{
				id: ids.generalJournal,
				code: 'GEN',
				name: 'General',
				type: 'GENERAL' as const
			}
		]

		for (const journal of journals) {
			await transaction.journal.upsert({
				where: { id: journal.id },
				update: {},
				create: { ...journal, businessId: ids.business }
			})
		}

		await transaction.tax.upsert({
			where: { id: ids.tax },
			update: { name: 'GST 18%' },
			create: {
				id: ids.tax,
				businessId: ids.business,
				name: 'GST 18%',
				rate: '18.0000',
				scope: 'BOTH',
				inputAccountId: ids.inputTax,
				outputAccountId: ids.outputTax
			}
		})

		await transaction.analyticAccount.upsert({
			where: { id: ids.analytic },
			update: {},
			create: {
				id: ids.analytic,
				businessId: ids.business,
				name: 'Furniture Purchases',
				type: 'EXPENSE'
			}
		})

		await transaction.analyticAccount.upsert({
			where: { id: ids.incomeAnalytic },
			update: {},
			create: {
				id: ids.incomeAnalytic,
				businessId: ids.business,
				name: 'Furniture Sales',
				type: 'INCOME'
			}
		})

		await transaction.budget.upsert({
			where: { id: ids.budget },
			update: {},
			create: {
				id: ids.budget,
				businessId: ids.business,
				name: 'Furniture Procurement 2026',
				startsOn: new Date('2026-04-01T00:00:00.000Z'),
				endsOn: new Date('2027-03-31T00:00:00.000Z'),
				responsibleUserId: ids.accountantUser,
				responsibleNameSnapshot: 'Kabir Malhotra',
				lines: {
					create: {
						id: ids.budgetLine,
						analyticAccountId: ids.analytic,
						plannedAmount: '500000.00'
					}
				}
			}
		})
	})

	const accountantAuthUser = authUsers.get('ulacct')
	if (!accountantAuthUser) throw new Error('Missing Auth identity for ulacct.')
	await seedRepresentativeActivity(accountantAuthUser.id)
	await seedShowcaseActivity(accountantAuthUser.id)
}

seed()
	.then(() => {
		console.log('Prepared local accounts, master data and representative business activity.')
	})
	.catch((error) => {
		console.error(error instanceof Error ? error.message : 'Local seed failed.')
		process.exitCode = 1
	})
	.finally(() => Promise.all([prisma.$disconnect(), getPrisma().$disconnect()]))

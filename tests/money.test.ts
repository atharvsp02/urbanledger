import assert from 'node:assert/strict'
import test from 'node:test'
import {
	addMoney,
	isNegativeMoney,
	isPositiveMoney,
	normalizeMoney,
	subtractMoney
} from '../src/lib/money'

test('normalizes and subtracts money without floating-point conversion', () => {
	assert.equal(normalizeMoney('1000'), '1000.00')
	assert.equal(normalizeMoney('0.1'), '0.10')
	assert.equal(subtractMoney('9007199254740993.00', '0.01'), '9007199254740992.99')
	assert.equal(subtractMoney('100.00', '125.50'), '-25.50')
	assert.equal(addMoney('9007199254740993.00', '0.01', '-3.00'), '9007199254740990.01')
})

test('compares signed money exactly', () => {
	assert.equal(isPositiveMoney('0.00'), false)
	assert.equal(isPositiveMoney('0.01'), true)
	assert.equal(isNegativeMoney('-0.01'), true)
	assert.equal(isNegativeMoney('-0.00'), false)
})

test('rejects unsupported money inputs', () => {
	assert.throws(() => normalizeMoney('1.001'))
	assert.throws(() => normalizeMoney('1e3'))
	assert.throws(() => normalizeMoney('01.00'))
})

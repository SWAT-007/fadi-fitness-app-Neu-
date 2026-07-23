import assert from 'node:assert/strict'
import test from 'node:test'

import { distributeNutritionTarget } from './nutrition-targets'

test('distributes a new target evenly when meals have no targets', () => {
  assert.deepEqual(distributeNutritionTarget(150, [0, 0, 0]), [50, 50, 50])
})

test('shares an increase evenly across the existing meal targets', () => {
  assert.deepEqual(distributeNutritionTarget(120, [20, 30, 40]), [30, 40, 50])
})

test('reduces targets proportionally without negative values', () => {
  assert.deepEqual(distributeNutritionTarget(60, [20, 30, 40]), [13.3, 20, 26.7])
})

test('keeps the rounded values on the requested total', () => {
  const values = distributeNutritionTarget(100, [0, 0, 0])
  assert.equal(values.reduce((sum, value) => sum + value, 0), 100)
})

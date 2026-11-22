import type { CalculatorInputs } from '../../../types/calculator';
import { clearFireCalculatorInputs, loadFireCalculatorInputs, saveFireCalculatorInputs } from '../../cookieStorage';
import { DEFAULT_INPUTS } from '../../defaults';
import { canonicalStringify, isPlainObject } from '../canonical';
import type { DomainAdapter } from '../types';

const complete = (inputs: Partial<CalculatorInputs>): CalculatorInputs => ({ ...DEFAULT_INPUTS, ...inputs });

export const calculatorAdapter: DomainAdapter<CalculatorInputs> = {
  domain: 'calculator',
  singletons: ['inputs'],
  collections: [],

  readLocal: () => loadFireCalculatorInputs(),

  writeLocalCache(doc) {
    if (doc) saveFireCalculatorInputs(complete(doc));
    else clearFireCalculatorInputs();
  },

  normalize(doc) {
    return { set: { inputs: doc ? complete(doc) : null }, collections: {} };
  },

  keyOf(collection) {
    throw new Error(`Calculator inputs have no collection named ${collection}.`);
  },

  denormalize(maps) {
    const value = maps.set.inputs;
    return isPlainObject(value) ? complete(value as Partial<CalculatorInputs>) : null;
  },

  isEmpty(doc) {
    return !doc || canonicalStringify(complete(doc)) === canonicalStringify(DEFAULT_INPUTS);
  },
};

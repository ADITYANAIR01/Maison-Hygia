/**
 * Maison Hygia Admin Dashboard - Validators
 */

// Validation rules
export const validators = {
  required: (message = 'This field is required') => (value) => {
    if (value === null || value === undefined || value === '') {
      return message;
    }
    if (typeof value === 'string' && value.trim() === '') {
      return message;
    }
    return null;
  },
  
  email: (message = 'Please enter a valid email address') => (value) => {
    if (!value) return null;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value) ? null : message;
  },
  
  minLength: (min, message) => (value) => {
    if (!value) return null;
    return value.length >= min ? null : message || `Must be at least ${min} characters`;
  },
  
  maxLength: (max, message) => (value) => {
    if (!value) return null;
    return value.length <= max ? null : message || `Must be no more than ${max} characters`;
  },
  
  pattern: (regex, message) => (value) => {
    if (!value) return null;
    return regex.test(value) ? null : message || 'Invalid format';
  },
  
  numeric: (message = 'Must be a number') => (value) => {
    if (!value) return null;
    return !isNaN(Number(value)) ? null : message;
  },
  
  integer: (message = 'Must be an integer') => (value) => {
    if (!value) return null;
    return Number.isInteger(Number(value)) ? null : message;
  },
  
  min: (min, message) => (value) => {
    if (!value) return null;
    return Number(value) >= min ? null : message || `Must be at least ${min}`;
  },
  
  max: (max, message) => (value) => {
    if (!value) return null;
    return Number(value) <= max ? null : message || `Must be no more than ${max}`;
  },
  
  url: (message = 'Please enter a valid URL') => (value) => {
    if (!value) return null;
    try {
      new URL(value);
      return null;
    } catch {
      return message;
    }
  },
  
  slug: (message = 'Use only lowercase letters, numbers, and hyphens') => (value) => {
    if (!value) return null;
    const slugRegex = /^[a-z0-9-]+$/;
    return slugRegex.test(value) ? null : message;
  },
  
  sku: (message = 'SKU must be uppercase letters, numbers, and hyphens only') => (value) => {
    if (!value) return null;
    const skuRegex = /^[A-Z0-9-]+$/;
    return skuRegex.test(value) ? null : message;
  },
  
  price: (message = 'Please enter a valid price') => (value) => {
    if (!value) return null;
    const price = Number(value);
    return price >= 0 && price <= 999999.99 ? null : message;
  },
  
  compare: (otherField, message = 'Values do not match') => (value, allValues) => {
    if (!value) return null;
    return value === allValues[otherField] ? null : message;
  }
};

// Compose multiple validators
export function compose(...validators) {
  return (value, allValues) => {
    for (const validator of validators) {
      const error = validator(value, allValues);
      if (error) return error;
    }
    return null;
  };
}

// Validate object
export function validateObject(obj, schema) {
  const errors = {};
  let isValid = true;
  
  Object.keys(schema).forEach(key => {
    const validator = schema[key];
    const error = validator(obj[key], obj);
    if (error) {
      errors[key] = error;
      isValid = false;
    }
  });
  
  return { isValid, errors };
}

// Field validation helper for forms
export function createFieldValidator(rules) {
  return (value, allValues) => {
    for (const rule of rules) {
      const error = rule(value, allValues);
      if (error) return error;
    }
    return null;
  };
}

// Common field validators
export const fieldValidators = {
  name: compose(
    validators.required('Name is required'),
    validators.minLength(2, 'Name must be at least 2 characters'),
    validators.maxLength(100, 'Name must be no more than 100 characters')
  ),
  
  sku: compose(
    validators.required('SKU is required'),
    validators.sku(),
    validators.maxLength(50, 'SKU must be no more than 50 characters')
  ),
  
  slug: compose(
    validators.required('Slug is required'),
    validators.slug(),
    validators.maxLength(100, 'Slug must be no more than 100 characters')
  ),
  
  email: compose(
    validators.required('Email is required'),
    validators.email()
  ),
  
  password: compose(
    validators.required('Password is required'),
    validators.minLength(8, 'Password must be at least 8 characters')
  ),
  
  price: compose(
    validators.required('Price is required'),
    validators.numeric('Price must be a number'),
    validators.price()
  ),
  
  quantity: compose(
    validators.required('Quantity is required'),
    validators.integer('Quantity must be a whole number'),
    validators.min(0, 'Quantity cannot be negative')
  ),
  
  description: validators.maxLength(5000, 'Description must be no more than 5000 characters')
};

export default validators;
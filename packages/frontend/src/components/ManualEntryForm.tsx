import { useState } from 'react';

interface LineItem {
  name: string;
  price: number;
}

interface ManualEntryFormProps {
  billId: string;
  payerId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

/**
 * Manual entry form for when Textract fails
 * Allows payer to manually enter line items, tax, and tip
 */
export function ManualEntryForm({ billId, payerId, onSuccess, onCancel }: ManualEntryFormProps) {
  const [lineItems, setLineItems] = useState<LineItem[]>([{ name: '', price: 0 }]);
  const [tax, setTax] = useState<number>(0);
  const [tip, setTip] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addLineItem = () => {
    setLineItems([...lineItems, { name: '', price: 0 }]);
  };

  const removeLineItem = (index: number) => {
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter((_, i) => i !== index));
    }
  };

  const updateLineItem = (index: number, field: 'name' | 'price', value: string | number) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };
    setLineItems(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate
    const validItems = lineItems.filter(item => item.name.trim() && item.price > 0);
    if (validItems.length === 0) {
      setError('Please add at least one line item with a name and price');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(
        `/api/bills/${billId}/manual-entry?payerId=${payerId}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            lineItems: validItems,
            tax,
            tip,
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error?.message || 'Failed to submit manual entry');
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit manual entry');
    } finally {
      setIsSubmitting(false);
    }
  };

  const subtotal = lineItems.reduce((sum, item) => sum + (item.price || 0), 0);
  const total = subtotal + tax + tip;

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Manual Entry</h2>
        <p className="text-gray-600">
          We couldn't automatically extract the receipt information. Please enter the details manually.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Line Items */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="block text-sm font-medium text-gray-700">Line Items</label>
            <button
              type="button"
              onClick={addLineItem}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              + Add Item
            </button>
          </div>

          <div className="space-y-3">
            {lineItems.map((item, index) => (
              <div key={index} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Item name"
                  value={item.name}
                  onChange={(e) => updateLineItem(index, 'name', e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
                <input
                  type="number"
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                  value={item.price || ''}
                  onChange={(e) => updateLineItem(index, 'price', parseFloat(e.target.value) || 0)}
                  className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
                {lineItems.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeLineItem(index)}
                    className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Tax */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Tax</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={tax || ''}
            onChange={(e) => setTax(parseFloat(e.target.value) || 0)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="0.00"
          />
        </div>

        {/* Tip */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Tip</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={tip || ''}
            onChange={(e) => setTip(parseFloat(e.target.value) || 0)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="0.00"
          />
        </div>

        {/* Summary */}
        <div className="bg-gray-50 rounded-lg p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Subtotal:</span>
            <span className="font-medium">${subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Tax:</span>
            <span className="font-medium">${tax.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Tip:</span>
            <span className="font-medium">${tip.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-lg font-bold pt-2 border-t border-gray-200">
            <span>Total:</span>
            <span>${total.toFixed(2)}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Submitting...' : 'Submit'}
          </button>
        </div>
      </form>
    </div>
  );
}

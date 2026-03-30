import { Suspense } from 'react';
import CalculatorShell from './calculator-shell';

export default function CalculatorPage() {
  return (
    <Suspense>
      <CalculatorShell />
    </Suspense>
  );
}

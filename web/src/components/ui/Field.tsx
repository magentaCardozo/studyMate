import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

interface FieldProps {
  label?: string;
  error?: string;
  hint?: string;
  children: (id: string, describedBy?: string) => ReactNode;
}

export function Field({ label, error, hint, children }: FieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div>
      {label && (
        <label htmlFor={id} className="label">
          {label}
        </label>
      )}
      {children(id, describedBy)}
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string; hint?: string };
export const Input = forwardRef<HTMLInputElement, InputProps>(({ label, error, hint, className = '', ...rest }, ref) => (
  <Field label={label} error={error} hint={hint}>
    {(id, describedBy) => <input ref={ref} id={id} aria-invalid={!!error || undefined} aria-describedby={describedBy} className={`field ${error ? 'border-danger' : ''} ${className}`} {...rest} />}
  </Field>
));
Input.displayName = 'Input';

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; error?: string; hint?: string };
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(({ label, error, hint, className = '', ...rest }, ref) => (
  <Field label={label} error={error} hint={hint}>
    {(id, describedBy) => <textarea ref={ref} id={id} aria-invalid={!!error || undefined} aria-describedby={describedBy} className={`field min-h-[96px] ${className}`} {...rest} />}
  </Field>
));
Textarea.displayName = 'Textarea';

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { label?: string; error?: string; hint?: string };
export const Select = forwardRef<HTMLSelectElement, SelectProps>(({ label, error, hint, className = '', children, ...rest }, ref) => (
  <Field label={label} error={error} hint={hint}>
    {(id, describedBy) => (
      <select ref={ref} id={id} aria-invalid={!!error || undefined} aria-describedby={describedBy} className={`field pr-8 ${className}`} {...rest}>
        {children}
      </select>
    )}
  </Field>
));
Select.displayName = 'Select';

export function Checkbox({ label, description, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; description?: string }) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3">
      <input id={id} type="checkbox" className="mt-1 h-4 w-4 rounded border-line text-crimson accent-crimson" {...rest} />
      <span>
        <span className="text-sm font-medium">{label}</span>
        {description && <span className="block text-[13px] text-muted">{description}</span>}
      </span>
    </label>
  );
}

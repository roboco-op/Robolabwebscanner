# Keyboard Navigation & Accessibility Guide

This document outlines all keyboard navigation features and ARIA accessibility improvements implemented in Robolab Web Scanner.

## Keyboard Navigation

### Global Shortcuts
- **Escape** - Close open modals (ConsultationModal)
- **Tab** - Navigate between all interactive elements
- **Shift + Tab** - Navigate backwards through elements
- **Enter** - Activate buttons and submit forms
- **Space** - Toggle checkboxes and activate buttons

### Component-Specific Navigation

#### ScanForm
- **URL Input Field**
  - Type URL and press **Enter** to start scan
  - Tab to navigate to submit button
  - **Ctrl+A** to select all text in input

- **Submit Button**
  - Press **Tab** to focus
  - Press **Enter** or **Space** to submit form
  - Visible focus ring indicates active state

#### ResultsPreview
- **AI Summary Card**
  - "Show more/less" button: **Tab** to focus, **Enter**/**Space** to toggle
  - "Regenerate" button: **Tab** to focus, **Enter**/**Space** to activate
  - "Copy summary" button: **Tab** to focus, **Enter**/**Space** to copy to clipboard

- **Email Report Form**
  - Email input: Type and **Tab** to next field
  - Checkbox: **Tab** to focus, **Space** to toggle
  - Submit button: **Tab** to focus, **Enter**/**Space** to submit
  - All form validation errors are announced with role="alert"

- **Action Buttons**
  - All buttons support **Enter** and **Space** keys
  - Visible focus rings on all interactive elements
  - Consultation booking link supports **Tab** navigation

#### ScanHistory
- **Filter & Sort Dropdowns**
  - **Tab** through select elements
  - **Arrow Up/Down** to change options
  - **Enter** to confirm selection

- **Refresh Button**
  - Press **Tab** to focus, **Enter**/**Space** to refresh

- **Action Buttons in Table**
  - View button: **Tab** to focus, **Enter**/**Space** to open scan
  - Download button: **Tab** to focus, **Enter**/**Space** to download PDF
  - Delete button: **Tab** to focus, **Enter**/**Space** to delete (with confirmation)

#### ProgressCharts
- **Interactive Charts**
  - Charts display with `role="img"` and descriptive aria-labels
  - Hover tooltips show detailed data values
  - Can Tab through chart container (informational only)

#### ConsultationModal
- **Modal Controls**
  - **Escape** key closes the modal
  - Close button automatically receives focus when modal opens
  - **Tab** navigates through form fields and buttons
  - Cannot Tab outside modal while open (proper focus trap)
  - **Tab** order: Close button → Name input → Email input → Submit button

- **Form Inputs**
  - Full Name: Press **Enter** to submit form
  - Email: Press **Enter** to submit form
  - Required fields marked with `aria-required="true"`

## ARIA Accessibility Labels

### Semantic HTML
- Main heading uses `<h1>` (page title)
- Section headings use `<h2>` (logical hierarchy)
- Articles wrapped in `<article>` tags for semantic content blocks
- Forms use `<form>` with `aria-label` for purpose
- Regions use `role="region"` with `aria-label` or `aria-labelledby`

### ARIA Attributes Used

#### aria-label
Provides accessible name for elements without visible text:
```html
<button aria-label="Close modal">
<button aria-label="View scan results for example.com">
<a aria-label="Download PDF for example.com">
```

#### aria-labelledby
Links label to content:
```html
<h2 id="modal-title">Consultation Form</h2>
<div role="dialog" aria-labelledby="modal-title">
```

#### aria-describedby
Provides additional description:
```html
<input aria-describedby="error-message" />
<p id="error-message">Please enter valid email</p>
```

#### aria-required
Marks form fields as required:
```html
<input type="email" aria-required="true" required />
```

#### aria-expanded
Indicates if expandable content is shown/hidden:
```html
<button aria-expanded="false" aria-controls="content">Show Details</button>
```

#### aria-busy
Shows loading state:
```html
<button aria-busy="true">Scanning...</button>
```

#### aria-live
Announces dynamic content updates:
```html
<p aria-live="polite" role="status">Report sent to email</p>
```

#### role="alert"
Announces error messages:
```html
<p role="alert">Please enter a valid email</p>
```

#### role="status"
Announces status messages:
```html
<p role="status">Scan completed successfully</p>
```

#### role="img"
For chart visualizations:
```html
<div role="img" aria-label="Line chart showing score progression">
  <Chart data={data} />
</div>
```

#### aria-hidden
Hides decorative icons from screen readers:
```html
<Calendar className="w-5 h-5" aria-hidden="true" />
```

## Focus Management

### Focus Indicators
All interactive elements have visible focus rings:
```css
focus:outline-none
focus:ring-2
focus:ring-blue-500
focus:ring-offset-2
```

### Focus Order
Components maintain logical Tab order:
1. ScanForm: URL input → Submit button
2. ResultsPreview: AI Summary buttons → Email form fields → Submit → Consultation link
3. ScanHistory: Filters/Sorts → Refresh button → Table action buttons
4. ConsultationModal: Close button → Form fields → Submit button

### Focus Trapping
ConsultationModal implements focus trapping to keep focus within modal when open.

## Form Validation & Error Messages

### Email Validation
- Invalid format: "Please enter a valid email address"
- Error message has `role="alert"` for immediate announcement
- Error text linked via `aria-describedby` to input field

### Required Fields
- All required fields marked with `aria-required="true"` and HTML `required` attribute
- Visual indicator `<span aria-label="required">*</span>`

## Screen Reader Support

### Tested With
- NVDA (Windows)
- JAWS (Windows)
- VoiceOver (macOS/iOS)
- TalkBack (Android)

### Content Announcements
1. **Page Title**: "Robo-Lab Analysis Console"
2. **Form Labels**: "Website URL to scan (required)"
3. **Form Errors**: Announced immediately with role="alert"
4. **Loading States**: "Scanning website" with aria-busy="true"
5. **Dynamic Updates**: "Report sent to email" with aria-live="polite"
6. **Charts**: Full description via aria-label on role="img"
7. **Button States**: Show expanded/collapsed state with aria-expanded

## Color Contrast

All text meets WCAG AA standards:
- Normal text: 4.5:1 contrast ratio minimum
- Large text (18pt+): 3:1 contrast ratio minimum
- Icons with text: Same as text contrast
- Focus indicators: Visible against backgrounds

## Testing Checklist

- [ ] Navigate entire app using Tab key only
- [ ] Close modals with Escape key
- [ ] All buttons activate with Enter and Space
- [ ] Form submission works with Enter key
- [ ] Error messages announced immediately
- [ ] Loading states communicate progress
- [ ] Checkboxes toggle with Space key
- [ ] Dropdowns respond to arrow keys
- [ ] Focus always visible
- [ ] No keyboard traps (except intentional modal)
- [ ] Screen reader announces all important content
- [ ] Color contrast meets WCAG AA

## Common Screen Reader Phrases

### Successful Completion
"Report sent to email, status message"
"Scan completed successfully, status message"

### Error States
"Please enter a valid email address, alert"
"Required field, required"

### Interactive Elements
"Close modal, button"
"View scan results for example.com, button"
"Start deep website scan, button"

### Loading States
"Scanning website, button, busy"
"Sending report, button, busy"

## Future Improvements

- [ ] Add keyboard shortcuts guide (accessible modal)
- [ ] Implement skip to main content link
- [ ] Add language/locale support for ARIA labels
- [ ] Keyboard shortcut reference in app
- [ ] Touch accessibility improvements for mobile
- [ ] High contrast mode support
- [ ] Reduced motion support (`prefers-reduced-motion`)

## References

- [WCAG 2.1 Level AA Standards](https://www.w3.org/WAI/WCAG21/quickref/)
- [ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/)
- [MDN Web Docs - ARIA](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA)
- [Accessible Rich Internet Applications (ARIA)](https://www.w3.org/TR/wai-aria-1.2/)

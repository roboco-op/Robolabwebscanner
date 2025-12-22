// WCAG 2.1 Compliance Checker
// Checks for WCAG AA level compliance issues

export interface WCAGIssue {
  criterion: string; // e.g., "1.4.3 Contrast (Minimum)"
  level: 'A' | 'AA';
  severity: 'critical' | 'serious' | 'moderate' | 'minor';
  description: string;
  examples: string[];
  remediation: string;
}

export interface WCAGResults {
  compliant_aa: boolean;
  compliant_a: boolean;
  issues: WCAGIssue[];
  checked_criteria: number;
  passed_criteria: number;
  score: number; // 0-100
}

export function checkWCAGCompliance(htmlContent: string): WCAGResults {
  const issues: WCAGIssue[] = [];

  // 1.1.1 Non-text Content (Level A)
  const imgs = htmlContent.match(/<img[^>]*>/gi) || [];
  const imgsWithoutAlt = imgs.filter(img => !img.match(/alt\s*=/i)).length;
  if (imgsWithoutAlt > 0) {
    issues.push({
      criterion: '1.1.1 Non-text Content',
      level: 'A',
      severity: 'critical',
      description: `${imgsWithoutAlt} images found without alt text`,
      examples: [
        '<img src="photo.jpg" alt="Description of photo">',
      ],
      remediation: 'Add descriptive alt text to all images',
    });
  }

  // 1.3.1 Info and Relationships (Level A)
  const hasProperHeadings = /h1|h2|h3|h4|h5|h6/i.test(htmlContent);
  const h1Count = (htmlContent.match(/<h1[^>]*>/gi) || []).length;
  if (h1Count !== 1) {
    issues.push({
      criterion: '1.3.1 Info and Relationships',
      level: 'A',
      severity: 'serious',
      description: `Page should have exactly 1 h1 tag, found ${h1Count}`,
      examples: ['<h1>Main Page Title</h1>'],
      remediation: 'Ensure each page has exactly one h1 element for main heading',
    });
  }

  // 1.4.3 Contrast (Minimum) - AA
  // This is complex and requires actual color parsing; simplified version:
  const styleElements = htmlContent.match(/<style[^>]*>([^<]+)<\/style>/gi) || [];
  const hasColorContrast = styleElements.some(el => {
    return /color|background|rgba|rgb|hex/.test(el);
  });
  if (styleElements.length > 0 && !hasColorContrast) {
    issues.push({
      criterion: '1.4.3 Contrast (Minimum)',
      level: 'AA',
      severity: 'serious',
      description: 'Unable to verify color contrast ratios; manual review recommended',
      examples: ['Foreground: #000000, Background: #FFFFFF (ratio 21:1 = PASS)'],
      remediation: 'Ensure text and background colors have at least 4.5:1 contrast ratio',
    });
  }

  // 1.4.10 Reflow (Level AA)
  const hasViewportMeta = /viewport|width=device-width/.test(htmlContent);
  if (!hasViewportMeta) {
    issues.push({
      criterion: '1.4.10 Reflow',
      level: 'AA',
      severity: 'serious',
      description: 'Responsive viewport meta tag not found',
      examples: ['<meta name="viewport" content="width=device-width, initial-scale=1.0">'],
      remediation: 'Add viewport meta tag to enable responsive design',
    });
  }

  // 2.1.1 Keyboard (Level A)
  const hasButton = /<button/i.test(htmlContent);
  const hasLinks = /<a/i.test(htmlContent);
  const hasOnlyMouseEvents = 
    htmlContent.match(/onclick\s*=/gi)?.length > 0 &&
    !htmlContent.match(/onkeypress|onkeydown|onkeyup/gi);
  
  if ((hasButton || hasLinks) && hasOnlyMouseEvents) {
    issues.push({
      criterion: '2.1.1 Keyboard',
      level: 'A',
      severity: 'critical',
      description: 'Interactive elements rely on mouse-only events',
      examples: [
        '<button onclick="action()">Click me</button> ❌',
        '<button onclick="action()" onkeypress="action()">Click me</button> ✓'
      ],
      remediation: 'Ensure all interactive elements are keyboard accessible',
    });
  }

  // 2.4.1 Bypass Blocks (Level A)
  const hasSkipLink = /skip|bypass|skip to content|jump to main/i.test(htmlContent);
  const hasNav = /<nav|<header|<main/i.test(htmlContent);
  if (hasNav && !hasSkipLink) {
    issues.push({
      criterion: '2.4.1 Bypass Blocks',
      level: 'A',
      severity: 'moderate',
      description: 'No skip navigation link found',
      examples: [
        '<a href="#main-content" class="skip-link">Skip to main content</a>'
      ],
      remediation: 'Add a skip navigation link at the beginning of the page',
    });
  }

  // 2.4.3 Focus Order (Level A)
  const tabIndexAbuse = (htmlContent.match(/tabindex\s*=\s*["']([0-9]+)["']/gi) || [])
    .filter(t => {
      const num = parseInt(t.match(/\d+/)?.[0] || '0');
      return num > 0;
    }).length;
  
  if (tabIndexAbuse > 0) {
    issues.push({
      criterion: '2.4.3 Focus Order',
      level: 'A',
      severity: 'moderate',
      description: `${tabIndexAbuse} elements with positive tabindex values (can disrupt focus order)`,
      examples: [
        '<button tabindex="1">First</button> ❌',
        '<button>First</button> ✓ (use natural order)'
      ],
      remediation: 'Avoid positive tabindex values; rely on natural document order',
    });
  }

  // 3.1.1 Language of Page (Level A)
  const hasLangAttr = /lang\s*=|lang:/i.test(htmlContent);
  if (!hasLangAttr) {
    issues.push({
      criterion: '3.1.1 Language of Page',
      level: 'A',
      severity: 'moderate',
      description: 'Page language not specified',
      examples: ['<html lang="en">'],
      remediation: 'Add lang attribute to html element',
    });
  }

  // 3.2.4 Consistent Identification (Level AA)
  const hasConsistentNav = /nav|header|footer|sidebar/i.test(htmlContent);
  if (!hasConsistentNav) {
    issues.push({
      criterion: '3.2.4 Consistent Identification',
      level: 'AA',
      severity: 'minor',
      description: 'No consistent navigation landmarks found',
      examples: ['<nav><header><main><footer>'],
      remediation: 'Use semantic HTML elements for consistent navigation',
    });
  }

  // 4.1.2 Name, Role, Value (Level A)
  const formsWithoutLabels = (htmlContent.match(/<input[^>]*>/gi) || [])
    .filter(input => !input.match(/aria-label|placeholder/i)).length;
  
  if (formsWithoutLabels > 0) {
    issues.push({
      criterion: '4.1.2 Name, Role, Value',
      level: 'A',
      severity: 'critical',
      description: `${formsWithoutLabels} form inputs without proper labeling`,
      examples: [
        '<input type="text" aria-label="Username">',
        '<input type="text" placeholder="Username">'
      ],
      remediation: 'Add aria-label or placeholder attributes to all form inputs',
    });
  }

  // 4.1.3 Status Messages (Level AA)
  const hasAriaLive = /aria-live|role="alert"|role="status"/i.test(htmlContent);
  if (!hasAriaLive) {
    issues.push({
      criterion: '4.1.3 Status Messages',
      level: 'AA',
      severity: 'moderate',
      description: 'No aria-live regions found for dynamic content',
      examples: [
        '<div aria-live="polite" aria-atomic="true">Status message</div>'
      ],
      remediation: 'Use aria-live regions for dynamic status updates',
    });
  }

  const totalCriteria = 15;
  const passedCriteria = totalCriteria - issues.length;
  const score = Math.round((passedCriteria / totalCriteria) * 100);

  const criticalIssues = issues.filter(i => i.severity === 'critical').length;
  const seriousIssues = issues.filter(i => i.severity === 'serious').length;

  return {
    compliant_aa: criticalIssues === 0 && seriousIssues === 0,
    compliant_a: criticalIssues === 0,
    issues,
    checked_criteria: totalCriteria,
    passed_criteria: passedCriteria,
    score,
  };
}

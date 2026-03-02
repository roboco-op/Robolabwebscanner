const drawPageHeader = (page: any, title: string, pageNum: number) => {
  // Dark blue header
  page.drawRectangle({
    x: 0,
    y: pageHeight - 80,
    width: pageWidth,
    height: 80,
    color: rgb(0.05, 0.15, 0.35),
  });

  // RoboLab(R) text logo in header
  page.drawText("RoboLab(R)", {
    x: 40,
    y: pageHeight - 42,
    size: 20,
    color: rgb(1, 1, 1),
  });

  // Title
  page.drawText(title, {
    x: 260,
    y: pageHeight - 40,
    size: 14,
    color: rgb(1, 1, 1),
  });

  // Page number
  page.drawText(`Page ${pageNum}`, {
    x: pageWidth - 80,
    y: pageHeight - 40,
    size: 10,
    color: rgb(0.8, 0.8, 0.8),
  });

  // Footer line
  page.drawRectangle({
    x: 0,
    y: 50,
    width: pageWidth,
    height: 0.5,
    color: rgb(0.8, 0.8, 0.8),
  });

  // Footer logo with RoboLab(R) text
  page.drawText("RoboLab(R)", {
    x: 40,
    y: 30,
    size: 11,
    color: rgb(0.05, 0.15, 0.35),
  });

  // Footer text
  page.drawText("Robo-Lab Web Scanner - Professional Security & Performance Analysis", {
    x: 250,
    y: 30,
    size: 8,
    color: rgb(0.6, 0.6, 0.6),
  });
};

import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { GeneratedPortfolio } from "./portfolioAgent";
import { logger } from "../core/logger";
import { saveFile } from "../shared/utils/fileSystem";

interface PdfExportOptions {
  generatedPortfolio: GeneratedPortfolio;
  pieChartRef: React.RefObject<HTMLDivElement | null>;
  barChartRef: React.RefObject<HTMLDivElement | null>;
  quantDashboardRef: React.RefObject<HTMLDivElement | null>;
  tickerAnalysisRef: React.RefObject<HTMLDivElement | null>;
  showQuantDashboard: boolean;
}

export const exportPortfolioToPdf = async ({
  generatedPortfolio,
  pieChartRef,
  barChartRef,
  quantDashboardRef,
  tickerAnalysisRef,
  showQuantDashboard
}: PdfExportOptions): Promise<void> => {
  try {
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 15;
    let yPos = margin;

    // Title
    pdf.setFontSize(20);
    pdf.setFont('helvetica', 'bold');
    pdf.text(generatedPortfolio.title || 'Portfolio', margin, yPos);
    yPos += 10;

    // Description
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    const descLines = pdf.splitTextToSize(generatedPortfolio.description || '', pageWidth - margin * 2);
    pdf.text(descLines, margin, yPos);
    yPos += descLines.length * 5 + 5;

    // Meta info
    pdf.setFontSize(9);
    pdf.text(`Risk: ${generatedPortfolio.riskLevel || 'N/A'} | Horizon: ${generatedPortfolio.timeHorizon || 'N/A'} | Rebalance: ${generatedPortfolio.rebalanceFrequency || 'N/A'}`, margin, yPos);
    yPos += 8;

    // Strategy
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Strategy', margin, yPos);
    yPos += 6;
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    const strategyLines = pdf.splitTextToSize(generatedPortfolio.strategy || '', pageWidth - margin * 2);
    pdf.text(strategyLines, margin, yPos);
    yPos += strategyLines.length * 4 + 8;

    // Holdings
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Holdings', margin, yPos);
    yPos += 6;
    
    pdf.setFontSize(8);
    if (generatedPortfolio.assets && generatedPortfolio.assets.length > 0) {
      generatedPortfolio.assets.forEach((asset) => {
        if (yPos > pageHeight - 20) {
          pdf.addPage();
          yPos = margin;
        }
        pdf.setFont('helvetica', 'bold');
        pdf.text(`${asset.symbol || ''} - ${(asset.allocation || 0).toFixed(1)}%`, margin, yPos);
        pdf.setFont('helvetica', 'normal');
        pdf.text(`  ${(asset.name || '').substring(0, 40)}`, margin + 35, yPos);
        yPos += 5;
      });
    }

    yPos += 5;

    // Helper function to capture chart as image with dimensions
    const captureChart = async (ref: React.RefObject<HTMLDivElement | null>): Promise<{image: string, width: number, height: number} | null> => {
      if (!ref.current) return null;
      try {
        const canvas = await html2canvas(ref.current, {
          backgroundColor: '#1a1a2e',
          scale: 3, // Higher scale for better quality
          logging: false,
          useCORS: true,
          allowTaint: true,
        });
        return {
          image: canvas.toDataURL('image/png', 1.0),
          width: canvas.width,
          height: canvas.height
        };
      } catch (e) {
        logger.error('Chart capture error:', e);
        return null;
      }
    };

    // Helper to add image with proper aspect ratio
    const addChartToPdf = (
      chartData: {image: string, width: number, height: number},
      title: string,
      maxHeight: number = 80
    ) => {
      const chartWidth = pageWidth - margin * 2;
      const aspectRatio = chartData.width / chartData.height;
      let chartHeight = chartWidth / aspectRatio;
      
      // Cap the height if too tall
      if (chartHeight > maxHeight) {
        chartHeight = maxHeight;
      }
      
      // Check if we need a new page
      if (yPos + chartHeight + 15 > pageHeight - margin) {
        pdf.addPage();
        yPos = margin;
      }
      
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'bold');
      pdf.text(title, margin, yPos);
      yPos += 6;
      
      pdf.addImage(chartData.image, 'PNG', margin, yPos, chartWidth, chartHeight);
      yPos += chartHeight + 10;
    };

    // Allocation Pie Chart
    if (pieChartRef.current) {
      const pieData = await captureChart(pieChartRef);
      if (pieData) {
        addChartToPdf(pieData, 'Allocation Distribution', 85);
      }
    }

    // Allocation Bar Chart
    if (barChartRef.current) {
      const barData = await captureChart(barChartRef);
      if (barData) {
        addChartToPdf(barData, 'Asset Allocation Breakdown', 85);
      }
    }

    // Quant Dashboard - give it its own page with more space
    if (quantDashboardRef.current && showQuantDashboard) {
      const quantData = await captureChart(quantDashboardRef);
      if (quantData) {
        pdf.addPage();
        yPos = margin;
        
        pdf.setFontSize(12);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Quantitative Analysis Dashboard', margin, yPos);
        yPos += 8;
        
        const chartWidth = pageWidth - margin * 2;
        const aspectRatio = quantData.width / quantData.height;
        let chartHeight = chartWidth / aspectRatio;
        
        // Allow more height for quant dashboard
        const maxQuantHeight = pageHeight - margin * 2 - 15;
        if (chartHeight > maxQuantHeight) {
          chartHeight = maxQuantHeight;
        }
        
        pdf.addImage(quantData.image, 'PNG', margin, yPos, chartWidth, chartHeight);
        yPos += chartHeight + 10;
      }
    }

    // Individual Ticker Analysis - capture each ticker card
    if (tickerAnalysisRef.current) {
      const tickerCards = tickerAnalysisRef.current.querySelectorAll('.ticker-analysis-inline');
      for (let i = 0; i < tickerCards.length; i++) {
        const card = tickerCards[i] as HTMLElement;
        try {
          const canvas = await html2canvas(card, {
            backgroundColor: '#1a1a2e',
            scale: 2,
            logging: false,
            useCORS: true,
            allowTaint: true,
          });
          const tickerData = {
            image: canvas.toDataURL('image/png', 1.0),
            width: canvas.width,
            height: canvas.height
          };
          
          pdf.addPage();
          yPos = margin;
          
          const chartWidth = pageWidth - margin * 2;
          const aspectRatio = tickerData.width / tickerData.height;
          let chartHeight = chartWidth / aspectRatio;
          
          const maxTickerHeight = pageHeight - margin * 2;
          if (chartHeight > maxTickerHeight) {
            chartHeight = maxTickerHeight;
          }
          
          pdf.addImage(tickerData.image, 'PNG', margin, yPos, chartWidth, chartHeight);
        } catch (e) {
          logger.error('Ticker card capture error:', e);
        }
      }
    }

    // Performance
    if (yPos > pageHeight - 30) {
      pdf.addPage();
      yPos = margin;
    }
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Expected Performance', margin, yPos);
    yPos += 5;
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Return: ${generatedPortfolio.expectedReturn || 'N/A'} | Volatility: ${generatedPortfolio.volatility || 'N/A'}`, margin, yPos);
    yPos += 8;

    // Reasoning
    if (yPos > pageHeight - 30) {
      pdf.addPage();
      yPos = margin;
    }
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    pdf.text('AI Reasoning', margin, yPos);
    yPos += 5;
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    const reasoningLines = pdf.splitTextToSize(generatedPortfolio.reasoning || '', pageWidth - margin * 2);
    pdf.text(reasoningLines, margin, yPos);
    yPos += reasoningLines.length * 4 + 8;

    // Monte Carlo Results
    if (generatedPortfolio.monteCarloResult) {
      if (yPos > pageHeight - 40) {
        pdf.addPage();
        yPos = margin;
      }
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Monte Carlo Simulation (1-Year Forecast)', margin, yPos);
      yPos += 5;
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'normal');
      const mc = generatedPortfolio.monteCarloResult;
      pdf.text(`Expected Value: $${mc.expectedValue.toFixed(2)} | Probability of Loss: ${mc.probabilityOfLoss.toFixed(2)}%`, margin, yPos);
      yPos += 4;
      pdf.text(`5th Percentile: $${mc.percentiles.p5.toFixed(2)} | 50th Percentile: $${mc.percentiles.p50.toFixed(2)} | 95th Percentile: $${mc.percentiles.p95.toFixed(2)}`, margin, yPos);
      yPos += 8;
    }

    // Backtest Results
    if (generatedPortfolio.backtestResult) {
      if (yPos > pageHeight - 40) {
        pdf.addPage();
        yPos = margin;
      }
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Historical Backtest Results', margin, yPos);
      yPos += 5;
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'normal');
      const bt = generatedPortfolio.backtestResult;
      pdf.text(`Total Return: ${bt.totalReturn.toFixed(2)}% | Annualized Return: ${bt.annualizedReturn.toFixed(2)}% | Sharpe Ratio: ${bt.sharpeRatio.toFixed(2)}`, margin, yPos);
      yPos += 4;
      pdf.text(`Max Drawdown: ${bt.maxDrawdown.toFixed(2)}% | Win Rate: ${bt.winRate.toFixed(2)}% | Calmar Ratio: ${bt.calmarRatio.toFixed(2)}`, margin, yPos);
      yPos += 4;
      pdf.text(`Best Year: ${bt.bestYear.toFixed(2)}% | Worst Year: ${bt.worstYear.toFixed(2)}%`, margin, yPos);
      yPos += 8;
    }

    // Quantitative Analysis per Asset
    const assetsWithQuant = generatedPortfolio.assets.filter(a => a.quantMetrics);
    if (assetsWithQuant.length > 0) {
      if (yPos > pageHeight - 40) {
        pdf.addPage();
        yPos = margin;
      }
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Quantitative Analysis by Asset', margin, yPos);
      yPos += 5;
      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'normal');
      assetsWithQuant.forEach(asset => {
        if (yPos > pageHeight - 15) {
          pdf.addPage();
          yPos = margin;
        }
        const q = asset.quantMetrics!;
        pdf.setFont('helvetica', 'bold');
        pdf.text(`${asset.symbol}:`, margin, yPos);
        pdf.setFont('helvetica', 'normal');
        pdf.text(`Sharpe: ${q.sharpeRatio.toFixed(2)} | Volatility: ${q.volatility.toFixed(2)}% | RSI: ${q.rsi.toFixed(0)} | Max DD: ${q.maxDrawdown.toFixed(2)}% | Signal: ${q.recommendation}`, margin + 20, yPos);
        yPos += 4;
      });
      yPos += 4;
    }

    // Fundamental Analysis per Asset
    const assetsWithFundamentals = generatedPortfolio.assets.filter(a => a.fundamentals);
    if (assetsWithFundamentals.length > 0) {
      if (yPos > pageHeight - 40) {
        pdf.addPage();
        yPos = margin;
      }
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Fundamental Analysis by Asset', margin, yPos);
      yPos += 5;
      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'normal');
      assetsWithFundamentals.forEach(asset => {
        if (yPos > pageHeight - 15) {
          pdf.addPage();
          yPos = margin;
        }
        const f = asset.fundamentals!;
        pdf.setFont('helvetica', 'bold');
        pdf.text(`${asset.symbol}:`, margin, yPos);
        pdf.setFont('helvetica', 'normal');
        const peStr = f.peRatio != null ? f.peRatio.toFixed(1) : 'N/A';
        const pbStr = f.priceToBook != null ? f.priceToBook.toFixed(2) : 'N/A';
        const roeStr = f.returnOnEquity != null ? (f.returnOnEquity * 100).toFixed(1) + '%' : 'N/A';
        const divStr = f.dividendYield != null ? (f.dividendYield * 100).toFixed(2) + '%' : 'N/A';
        pdf.text(`P/E: ${peStr} | P/B: ${pbStr} | ROE: ${roeStr} | Div Yield: ${divStr}`, margin + 20, yPos);
        yPos += 4;
      });
      yPos += 4;
    }

    // Market Insights
    const assetsWithInsights = generatedPortfolio.assets.filter(a => a.marketInsights && a.marketInsights.length > 0);
    if (assetsWithInsights.length > 0) {
      if (yPos > pageHeight - 40) {
        pdf.addPage();
        yPos = margin;
      }
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Market Insights', margin, yPos);
      yPos += 5;
      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'normal');
      assetsWithInsights.forEach(asset => {
        asset.marketInsights!.slice(0, 2).forEach(insight => {
          if (yPos > pageHeight - 15) {
            pdf.addPage();
            yPos = margin;
          }
          pdf.setFont('helvetica', 'bold');
          pdf.text(`${asset.symbol}:`, margin, yPos);
          pdf.setFont('helvetica', 'normal');
          const insightText = pdf.splitTextToSize(`${insight.headline} - ${insight.analysis}`, pageWidth - margin * 2 - 20);
          pdf.text(insightText, margin + 20, yPos);
          yPos += insightText.length * 3 + 2;
        });
      });
    }

    // Footer
    const totalPages = pdf.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      pdf.setPage(i);
      pdf.setFontSize(7);
      pdf.setTextColor(128);
      pdf.text(`FlowFolio | ${new Date().toLocaleDateString()} | Page ${i}/${totalPages}`, margin, pageHeight - 8);
      pdf.setTextColor(0);
    }

    // Auto-download PDF
    const safeTitle = (generatedPortfolio.title || 'Portfolio').replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '_');
    const fileName = `${safeTitle}_${new Date().toISOString().split('T')[0]}.pdf`;
    
    // Get PDF as ArrayBuffer
    const pdfOutput = pdf.output('arraybuffer');
    
    // Use robust save utility
    await saveFile(new Uint8Array(pdfOutput), fileName, 'application/pdf');
    
  } catch (err) {
    logger.error('PDF export error:', err);
    throw err;
  }
};

// src/services/ai/agents/ProductionPlannerAgent.js

import { db } from '../../firebase/config';
import { collection, getDocs, doc, getDoc, query, where } from 'firebase/firestore';

/**
 * ProductionPlannerAgent - Autonomiczny agent do planowania produkcji
 * Wykonuje multi-step tasks bez ingerencji użytkownika
 */
export class ProductionPlannerAgent {

  /**
   * Autonomicznie planuje produkcję dla zamówienia
   */
  static async planProduction(orderId) {
    const plan = {
      orderId,
      steps: [],
      warnings: [],
      recommendations: [],
      errors: [],
      success: false,
      timestamp: new Date().toISOString()
    };

    try {
      console.log(`[ProductionPlannerAgent] Rozpoczynam planowanie dla zamówienia: ${orderId}`);

      // Krok 1: Pobierz zamówienie
      const step1 = await this.step1_fetchOrder(orderId);
      plan.steps.push(step1);
      
      if (!step1.success) {
        plan.errors.push(step1.error);
        return plan;
      }

      const order = step1.data;

      // Krok 2: Sprawdź dostępność składników
      const step2 = await this.step2_checkInventory(order.items);
      plan.steps.push(step2);

      if (step2.missing.length > 0) {
        plan.warnings.push({
          type: 'missing_inventory',
          message: `Brakuje ${step2.missing.length} składników`,
          items: step2.missing
        });

        // Krok 3: Generuj zamówienie zakupu dla brakujących składników
        const step3 = await this.step3_generatePurchaseOrder(step2.missing);
        plan.steps.push(step3);

        if (step3.success) {
          plan.recommendations.push({
            type: 'purchase_order',
            priority: 'high',
            message: 'Wygenerowano propozycję zamówienia zakupu',
            data: step3.purchaseOrder,
            action: 'create_purchase_order',
            actionData: step3.purchaseOrder
          });
        }
      }

      // Krok 4: Zaplanuj zadania produkcyjne
      const step4 = await this.step4_createProductionTasks(order, step2);
      plan.steps.push(step4);

      if (!step4.success) {
        plan.errors.push(step4.error);
        return plan;
      }

      // Krok 5: Optymalizuj harmonogram
      const step5 = await this.step5_optimizeSchedule(step4.tasks);
      plan.steps.push(step5);

      if (step5.success) {
        plan.recommendations.push({
          type: 'schedule',
          priority: 'medium',
          message: 'Zoptymalizowano harmonogram produkcji',
          data: step5.schedule,
          estimatedCompletionDate: step5.estimatedCompletionDate
        });
      }

      // Krok 6: Oceń ryzyka
      const step6 = await this.step6_assessRisks(order, step2, step4.tasks);
      plan.steps.push(step6);

      if (step6.risks.length > 0) {
        plan.warnings.push({
          type: 'risks',
          message: `Zidentyfikowano ${step6.risks.length} potencjalnych ryzyk`,
          items: step6.risks
        });
      }

      plan.success = true;
      plan.summary = this.generateSummary(plan);

      console.log(`[ProductionPlannerAgent] ✅ Planowanie zakończone pomyślnie`);

      return plan;

    } catch (error) {
      console.error('[ProductionPlannerAgent] Błąd podczas planowania:', error);
      plan.errors.push({
        message: error.message,
        stack: error.stack
      });
      return plan;
    }
  }

  // ==================== KROKI PLANOWANIA ====================

  /**
   * Krok 1: Pobierz zamówienie
   */
  static async step1_fetchOrder(orderId) {
    try {
      console.log('[ProductionPlannerAgent] Krok 1: Pobieram zamówienie');
      
      const orderRef = doc(db, 'customerOrders', orderId);
      const orderSnap = await getDoc(orderRef);

      if (!orderSnap.exists()) {
        return {
          step: 1,
          name: 'Pobierz zamówienie',
          success: false,
          error: `Zamówienie ${orderId} nie istnieje`,
          timestamp: Date.now()
        };
      }

      const order = {
        id: orderSnap.id,
        ...orderSnap.data()
      };

      return {
        step: 1,
        name: 'Pobierz zamówienie',
        success: true,
        message: `Pobrano zamówienie ${orderId}`,
        data: order,
        timestamp: Date.now()
      };

    } catch (error) {
      return {
        step: 1,
        name: 'Pobierz zamówienie',
        success: false,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  /**
   * Krok 2: Sprawdź dostępność składników
   */
  static async step2_checkInventory(orderItems) {
    try {
      console.log('[ProductionPlannerAgent] Krok 2: Sprawdzam dostępność składników');

      const inventoryRef = collection(db, 'inventory');
      const snapshot = await getDocs(inventoryRef);

      const inventory = {};
      snapshot.forEach(doc => {
        const item = doc.data();
        inventory[doc.id] = {
          id: doc.id,
          name: item.name,
          quantity: item.quantity || 0,
          minQuantity: item.minQuantity || 0,
          unit: item.unit
        };
      });

      const available = [];
      const missing = [];
      const lowStock = [];

      orderItems?.forEach(orderItem => {
        const inventoryItem = inventory[orderItem.productId];
        
        if (!inventoryItem) {
          missing.push({
            productId: orderItem.productId,
            productName: orderItem.productName,
            requiredQuantity: orderItem.quantity,
            availableQuantity: 0,
            reason: 'Produkt nie istnieje w magazynie'
          });
        } else if (inventoryItem.quantity < orderItem.quantity) {
          missing.push({
            productId: orderItem.productId,
            productName: inventoryItem.name,
            requiredQuantity: orderItem.quantity,
            availableQuantity: inventoryItem.quantity,
            shortfall: orderItem.quantity - inventoryItem.quantity,
            reason: 'Niewystarczająca ilość'
          });
        } else {
          available.push({
            productId: orderItem.productId,
            productName: inventoryItem.name,
            requiredQuantity: orderItem.quantity,
            availableQuantity: inventoryItem.quantity
          });

          // Sprawdź czy po wykorzystaniu będzie niski stan
          if (inventoryItem.quantity - orderItem.quantity <= inventoryItem.minQuantity) {
            lowStock.push({
              productId: orderItem.productId,
              productName: inventoryItem.name,
              afterUse: inventoryItem.quantity - orderItem.quantity,
              minQuantity: inventoryItem.minQuantity
            });
          }
        }
      });

      return {
        step: 2,
        name: 'Sprawdź dostępność składników',
        success: true,
        message: `Dostępne: ${available.length}, Brakujące: ${missing.length}, Niski stan po użyciu: ${lowStock.length}`,
        available,
        missing,
        lowStock,
        timestamp: Date.now()
      };

    } catch (error) {
      return {
        step: 2,
        name: 'Sprawdź dostępność składników',
        success: false,
        error: error.message,
        available: [],
        missing: [],
        lowStock: [],
        timestamp: Date.now()
      };
    }
  }

  /**
   * Krok 3: Generuj zamówienie zakupu
   */
  static async step3_generatePurchaseOrder(missingItems) {
    try {
      console.log('[ProductionPlannerAgent] Krok 3: Generuję zamówienie zakupu');

      if (missingItems.length === 0) {
        return {
          step: 3,
          name: 'Generuj zamówienie zakupu',
          success: true,
          message: 'Brak brakujących składników',
          timestamp: Date.now()
        };
      }

      // Grupuj po dostawcach (uproszczone - w rzeczywistości pobieralibyśmy dane o dostawcach)
      const purchaseOrder = {
        items: missingItems.map(item => ({
          productId: item.productId,
          productName: item.productName,
          quantity: item.shortfall || item.requiredQuantity,
          urgency: 'high' // Dla produkcji zawsze high
        })),
        totalItems: missingItems.length,
        status: 'draft',
        reason: 'Automatycznie wygenerowane dla potrzeb produkcji',
        generatedAt: new Date().toISOString()
      };

      return {
        step: 3,
        name: 'Generuj zamówienie zakupu',
        success: true,
        message: `Wygenerowano zamówienie na ${missingItems.length} produktów`,
        purchaseOrder,
        timestamp: Date.now()
      };

    } catch (error) {
      return {
        step: 3,
        name: 'Generuj zamówienie zakupu',
        success: false,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  /**
   * Krok 4: Utwórz zadania produkcyjne
   */
  static async step4_createProductionTasks(order, inventoryCheck) {
    try {
      console.log('[ProductionPlannerAgent] Krok 4: Tworzę zadania produkcyjne');

      const tasks = [];

      order.items?.forEach((item, index) => {
        const isAvailable = inventoryCheck.available.some(
          a => a.productId === item.productId
        );

        tasks.push({
          taskId: `task_${order.id}_${index}`,
          orderId: order.id,
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          status: isAvailable ? 'ready' : 'blocked',
          blockedReason: !isAvailable ? 'Oczekiwanie na składniki' : null,
          priority: order.priority || 'normal',
          estimatedDuration: this.estimateDuration(item.quantity),
          createdAt: new Date().toISOString()
        });
      });

      return {
        step: 4,
        name: 'Utwórz zadania produkcyjne',
        success: true,
        message: `Utworzono ${tasks.length} zadań produkcyjnych`,
        tasks,
        readyTasks: tasks.filter(t => t.status === 'ready').length,
        blockedTasks: tasks.filter(t => t.status === 'blocked').length,
        timestamp: Date.now()
      };

    } catch (error) {
      return {
        step: 4,
        name: 'Utwórz zadania produkcyjne',
        success: false,
        error: error.message,
        tasks: [],
        timestamp: Date.now()
      };
    }
  }

  /**
   * Krok 5: Optymalizuj harmonogram
   */
  static async step5_optimizeSchedule(tasks) {
    try {
      console.log('[ProductionPlannerAgent] Krok 5: Optymalizuję harmonogram');

      // Sortuj zadania według priorytetu i czasu trwania
      const priorityOrder = { high: 3, normal: 2, low: 1 };
      
      const sortedTasks = [...tasks].sort((a, b) => {
        const priorityDiff = (priorityOrder[b.priority] || 2) - (priorityOrder[a.priority] || 2);
        if (priorityDiff !== 0) return priorityDiff;
        return a.estimatedDuration - b.estimatedDuration; // Krótsze zadania pierwsze
      });

      // Przypisz daty rozpoczęcia
      let currentDate = new Date();
      const schedule = sortedTasks.map((task, index) => {
        const startDate = new Date(currentDate);
        currentDate = new Date(currentDate.getTime() + task.estimatedDuration * 60 * 60 * 1000);
        const endDate = new Date(currentDate);

        return {
          ...task,
          scheduledStart: startDate.toISOString(),
          scheduledEnd: endDate.toISOString(),
          position: index + 1
        };
      });

      const estimatedCompletionDate = schedule[schedule.length - 1]?.scheduledEnd;

      return {
        step: 5,
        name: 'Optymalizuj harmonogram',
        success: true,
        message: `Zoptymalizowano harmonogram dla ${tasks.length} zadań`,
        schedule,
        estimatedCompletionDate,
        totalDuration: tasks.reduce((sum, t) => sum + t.estimatedDuration, 0),
        timestamp: Date.now()
      };

    } catch (error) {
      return {
        step: 5,
        name: 'Optymalizuj harmonogram',
        success: false,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  /**
   * Krok 6: Oceń ryzyka
   */
  static async step6_assessRisks(order, inventoryCheck, tasks) {
    try {
      console.log('[ProductionPlannerAgent] Krok 6: Oceniam ryzyka');

      const risks = [];

      // Ryzyko 1: Brakujące składniki
      if (inventoryCheck.missing.length > 0) {
        risks.push({
          type: 'inventory_shortage',
          severity: 'high',
          description: `Brakuje ${inventoryCheck.missing.length} składników`,
          impact: 'Opóźnienie produkcji',
          mitigation: 'Złóż zamówienie zakupu',
          affectedTasks: tasks.filter(t => t.status === 'blocked').length
        });
      }

      // Ryzyko 2: Niski stan po produkcji
      if (inventoryCheck.lowStock.length > 0) {
        risks.push({
          type: 'low_stock_after_production',
          severity: 'medium',
          description: `${inventoryCheck.lowStock.length} produktów będzie miało niski stan`,
          impact: 'Ryzyko problemów z przyszłymi zamówieniami',
          mitigation: 'Zaplanuj uzupełnienie stanów'
        });
      }

      // Ryzyko 3: Dużo zadań jednocześnie
      if (tasks.length > 5) {
        risks.push({
          type: 'high_workload',
          severity: 'low',
          description: `Dużo zadań do wykonania (${tasks.length})`,
          impact: 'Możliwe opóźnienia',
          mitigation: 'Rozważ priorytetyzację lub dodatkowe zasoby'
        });
      }

      // Ryzyko 4: Wysokopriorytetowe zamówienie
      if (order.priority === 'high' || order.urgent) {
        risks.push({
          type: 'urgent_order',
          severity: 'medium',
          description: 'Zamówienie pilne',
          impact: 'Wymaga natychmiastowej uwagi',
          mitigation: 'Alokuj zasoby priorytetowo'
        });
      }

      return {
        step: 6,
        name: 'Oceń ryzyka',
        success: true,
        message: `Zidentyfikowano ${risks.length} potencjalnych ryzyk`,
        risks,
        overallRiskLevel: this.calculateOverallRisk(risks),
        timestamp: Date.now()
      };

    } catch (error) {
      return {
        step: 6,
        name: 'Oceń ryzyka',
        success: false,
        error: error.message,
        risks: [],
        timestamp: Date.now()
      };
    }
  }

  // ==================== POMOCNICZE METODY ====================

  static estimateDuration(quantity) {
    // Prosta heurystyka - 1 jednostka = 0.5h
    return Math.max(1, Math.ceil(quantity * 0.5));
  }

  static calculateOverallRisk(risks) {
    if (risks.length === 0) return 'low';
    
    const severityCounts = {
      high: risks.filter(r => r.severity === 'high').length,
      medium: risks.filter(r => r.severity === 'medium').length,
      low: risks.filter(r => r.severity === 'low').length
    };

    if (severityCounts.high > 0) return 'high';
    if (severityCounts.medium > 1) return 'medium';
    if (severityCounts.medium > 0 || severityCounts.low > 2) return 'medium';
    return 'low';
  }

  static generateSummary(plan) {
    const completedSteps = plan.steps.filter(s => s.success).length;
    const totalSteps = plan.steps.length;

    return {
      completedSteps: `${completedSteps}/${totalSteps}`,
      success: plan.success,
      hasWarnings: plan.warnings.length > 0,
      hasErrors: plan.errors.length > 0,
      warningsCount: plan.warnings.length,
      errorsCount: plan.errors.length,
      recommendationsCount: plan.recommendations.length,
      overallStatus: plan.success && plan.errors.length === 0 ? 'success' : 
                     plan.warnings.length > 0 ? 'warning' : 'error'
    };
  }

  /**
   * Formatuje plan do czytelnego raportu tekstowego
   */
  static formatPlanReport(plan) {
    let report = `🤖 RAPORT PLANOWANIA PRODUKCJI\n`;
    report += `════════════════════════════════════════\n\n`;
    report += `Zamówienie: ${plan.orderId}\n`;
    report += `Data: ${new Date(plan.timestamp).toLocaleString('pl-PL')}\n`;
    report += `Status: ${plan.success ? '✅ Sukces' : '❌ Błąd'}\n\n`;

    report += `════════════════════════════════════════\n`;
    report += `📋 WYKONANE KROKI (${plan.summary?.completedSteps}):\n`;
    report += `════════════════════════════════════════\n`;
    plan.steps.forEach(step => {
      const icon = step.success ? '✅' : '❌';
      report += `${icon} Krok ${step.step}: ${step.name}\n`;
      report += `   ${step.message || step.error}\n\n`;
    });

    if (plan.warnings.length > 0) {
      report += `════════════════════════════════════════\n`;
      report += `⚠️  OSTRZEŻENIA (${plan.warnings.length}):\n`;
      report += `════════════════════════════════════════\n`;
      plan.warnings.forEach((warning, i) => {
        report += `${i + 1}. ${warning.message}\n`;
      });
      report += `\n`;
    }

    if (plan.recommendations.length > 0) {
      report += `════════════════════════════════════════\n`;
      report += `💡 REKOMENDACJE (${plan.recommendations.length}):\n`;
      report += `════════════════════════════════════════\n`;
      plan.recommendations.forEach((rec, i) => {
        const priorityIcon = rec.priority === 'high' ? '🔴' : rec.priority === 'medium' ? '🟡' : '🟢';
        report += `${i + 1}. ${priorityIcon} ${rec.message}\n`;
      });
      report += `\n`;
    }

    if (plan.errors.length > 0) {
      report += `════════════════════════════════════════\n`;
      report += `❌ BŁĘDY (${plan.errors.length}):\n`;
      report += `════════════════════════════════════════\n`;
      plan.errors.forEach((error, i) => {
        report += `${i + 1}. ${error.message || error}\n`;
      });
    }

    return report;
  }
}






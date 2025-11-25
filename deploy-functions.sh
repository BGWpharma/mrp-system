#!/bin/bash

# ============================================================================
# Deploy Cloud Functions - BGW-MRP System
# Region: europe-central2
# Node.js: 22
# Firebase Functions: v2 (2nd Gen)
# ============================================================================

# Kolory
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
GRAY='\033[0;90m'
WHITE='\033[1;37m'
NC='\033[0m' # No Color

echo -e "${CYAN}================================================${NC}"
echo -e "${CYAN}   BGW-MRP Cloud Functions Deployment Script${NC}"
echo -e "${CYAN}================================================${NC}"
echo ""

# Sprawdź czy Firebase CLI jest zainstalowany
echo -e "${YELLOW}[1/4] Sprawdzanie Firebase CLI...${NC}"
if command -v firebase &> /dev/null; then
    FIREBASE_VERSION=$(firebase --version)
    echo -e "${GREEN}✓ Firebase CLI zainstalowany: $FIREBASE_VERSION${NC}"
else
    echo -e "${RED}✗ Firebase CLI nie jest zainstalowany!${NC}"
    echo -e "${RED}Zainstaluj: npm install -g firebase-tools${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}[2/4] Sprawdzanie katalogu functions...${NC}"

if [ ! -f "functions/index.js" ]; then
    echo -e "${RED}✗ Nie znaleziono pliku functions/index.js${NC}"
    echo -e "${RED}Uruchom skrypt z głównego katalogu projektu.${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Katalog functions znaleziony${NC}"

echo ""
echo -e "${YELLOW}[3/4] Weryfikacja kodu (linting)...${NC}"
cd functions
npm run lint
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Kod przeszedł weryfikację${NC}"
else
    echo -e "${RED}✗ Znaleziono błędy w kodzie${NC}"
    cd ..
    exit 1
fi
cd ..

echo ""
echo -e "${YELLOW}[4/4] Wybierz funkcje do deploymentu:${NC}"
echo ""
echo -e "${WHITE}Dostępne funkcje:${NC}"
echo -e "  ${GRAY}1. getRandomBatch                 (funkcja testowa)${NC}"
echo -e "  ${CYAN}2. onPurchaseOrderUpdate          (PO → Batch)${NC}"
echo -e "  ${CYAN}3. onBatchPriceUpdate             (Batch → MO)${NC}"
echo -e "  ${CYAN}4. onProductionTaskCostUpdate     (MO → CO)${NC}"
echo ""
echo -e "  ${MAGENTA}5. Wszystkie nowe triggery        (2 + 3 + 4)${NC}"
echo -e "  ${MAGENTA}6. Wszystkie funkcje              (1 + 2 + 3 + 4)${NC}"
echo ""
echo -e "  ${RED}0. Anuluj${NC}"
echo ""

read -p "Wybierz opcję (0-6): " choice

case $choice in
    1)
        echo ""
        echo -e "${YELLOW}Deploying: getRandomBatch${NC}"
        firebase deploy --only functions:bgw-mrp:getRandomBatch
        ;;
    2)
        echo ""
        echo -e "${YELLOW}⚠️  UWAGA: Ta funkcja automatycznie aktualizuje ceny partii!${NC}"
        echo -e "${YELLOW}   Po deploymencie będzie reagować na zmiany w Purchase Orders.${NC}"
        echo ""
        read -p "Czy na pewno chcesz kontynuować? (tak/nie): " confirm
        if [ "$confirm" == "tak" ]; then
            echo ""
            echo -e "${YELLOW}Deploying: onPurchaseOrderUpdate${NC}"
            firebase deploy --only functions:bgw-mrp:onPurchaseOrderUpdate
        else
            echo -e "${RED}Deployment anulowany.${NC}"
            exit 0
        fi
        ;;
    3)
        echo ""
        echo -e "${YELLOW}⚠️  UWAGA: Ta funkcja automatycznie aktualizuje koszty w zadaniach!${NC}"
        echo -e "${YELLOW}   Po deploymencie będzie reagować na zmiany cen partii.${NC}"
        echo ""
        read -p "Czy na pewno chcesz kontynuować? (tak/nie): " confirm
        if [ "$confirm" == "tak" ]; then
            echo ""
            echo -e "${YELLOW}Deploying: onBatchPriceUpdate${NC}"
            firebase deploy --only functions:bgw-mrp:onBatchPriceUpdate
        else
            echo -e "${RED}Deployment anulowany.${NC}"
            exit 0
        fi
        ;;
    4)
        echo ""
        echo -e "${YELLOW}⚠️  UWAGA: Ta funkcja automatycznie aktualizuje wartości w zamówieniach!${NC}"
        echo -e "${YELLOW}   Po deploymencie będzie reagować na zmiany kosztów w zadaniach.${NC}"
        echo ""
        read -p "Czy na pewno chcesz kontynuować? (tak/nie): " confirm
        if [ "$confirm" == "tak" ]; then
            echo ""
            echo -e "${YELLOW}Deploying: onProductionTaskCostUpdate${NC}"
            firebase deploy --only functions:bgw-mrp:onProductionTaskCostUpdate
        else
            echo -e "${RED}Deployment anulowany.${NC}"
            exit 0
        fi
        ;;
    5)
        echo ""
        echo -e "${YELLOW}⚠️  UWAGA: Deploying wszystkich triggerów łańcucha wartości!${NC}"
        echo -e "${YELLOW}   PO → Batch → MO → CO${NC}"
        echo ""
        echo -e "${WHITE}Po deploymencie system będzie automatycznie:${NC}"
        echo -e "  ${GRAY}• Aktualizować ceny partii przy zmianach w PO${NC}"
        echo -e "  ${GRAY}• Aktualizować koszty zadań przy zmianach cen partii${NC}"
        echo -e "  ${GRAY}• Aktualizować wartości zamówień przy zmianach kosztów zadań${NC}"
        echo ""
        read -p "Czy na pewno chcesz kontynuować? (tak/nie): " confirm
        if [ "$confirm" == "tak" ]; then
            echo ""
            echo -e "${YELLOW}Step 1/3: Deploying onPurchaseOrderUpdate...${NC}"
            firebase deploy --only functions:bgw-mrp:onPurchaseOrderUpdate
            
            if [ $? -eq 0 ]; then
                echo -e "${GREEN}✓ onPurchaseOrderUpdate deployed${NC}"
                echo ""
                echo -e "${YELLOW}Step 2/3: Deploying onBatchPriceUpdate...${NC}"
                firebase deploy --only functions:bgw-mrp:onBatchPriceUpdate
                
                if [ $? -eq 0 ]; then
                    echo -e "${GREEN}✓ onBatchPriceUpdate deployed${NC}"
                    echo ""
                    echo -e "${YELLOW}Step 3/3: Deploying onProductionTaskCostUpdate...${NC}"
                    firebase deploy --only functions:bgw-mrp:onProductionTaskCostUpdate
                    
                    if [ $? -eq 0 ]; then
                        echo -e "${GREEN}✓ onProductionTaskCostUpdate deployed${NC}"
                    fi
                fi
            fi
        else
            echo -e "${RED}Deployment anulowany.${NC}"
            exit 0
        fi
        ;;
    6)
        echo ""
        echo -e "${YELLOW}⚠️  UWAGA: Deploying WSZYSTKICH funkcji!${NC}"
        echo ""
        read -p "Czy na pewno chcesz kontynuować? (tak/nie): " confirm
        if [ "$confirm" == "tak" ]; then
            echo ""
            echo -e "${YELLOW}Step 1/4: Deploying getRandomBatch...${NC}"
            firebase deploy --only functions:bgw-mrp:getRandomBatch
            
            echo ""
            echo -e "${YELLOW}Step 2/4: Deploying onPurchaseOrderUpdate...${NC}"
            firebase deploy --only functions:bgw-mrp:onPurchaseOrderUpdate
            
            echo ""
            echo -e "${YELLOW}Step 3/4: Deploying onBatchPriceUpdate...${NC}"
            firebase deploy --only functions:bgw-mrp:onBatchPriceUpdate
            
            echo ""
            echo -e "${YELLOW}Step 4/4: Deploying onProductionTaskCostUpdate...${NC}"
            firebase deploy --only functions:bgw-mrp:onProductionTaskCostUpdate
        else
            echo -e "${RED}Deployment anulowany.${NC}"
            exit 0
        fi
        ;;
    0)
        echo ""
        echo -e "${RED}Deployment anulowany.${NC}"
        exit 0
        ;;
    *)
        echo ""
        echo -e "${RED}Nieprawidłowy wybór.${NC}"
        exit 1
        ;;
esac

echo ""
echo -e "${CYAN}================================================${NC}"
echo -e "${CYAN}   Deployment zakończony!${NC}"
echo -e "${CYAN}================================================${NC}"
echo ""
echo -e "${YELLOW}Sprawdź logi funkcji:${NC}"
echo -e "  ${GRAY}firebase functions:log${NC}"
echo ""
echo -e "${YELLOW}Lub sprawdź w konsoli Firebase:${NC}"
echo -e "  ${GRAY}https://console.firebase.google.com/project/bgw-mrp-system/functions${NC}"
echo ""


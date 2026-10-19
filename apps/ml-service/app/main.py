from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI

from .core.security import require_service_key
from .schemas.models import GuideInput, InteractionInput, ScanFeatures, TriageInput
from .services import anomaly, interactions, rag, triage

@asynccontextmanager
async def lifespan(_: FastAPI):
    # train/load the small models once at boot
    anomaly.get_model(); triage.get_model(); rag.get_rag()
    yield


app = FastAPI(title="VEAP ML Service", version="2.0.0", docs_url="/docs", lifespan=lifespan)
auth = [Depends(require_service_key)]


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "models": ["anomaly:isolation-forest", "triage:gradient-boosting", "assistant:tfidf-retrieval"]}


@app.post("/anomaly/score", dependencies=auth)
def anomaly_score(body: ScanFeatures) -> dict:
    return anomaly.get_model().score(body.model_dump())


@app.post("/triage/predict", dependencies=auth)
def triage_predict(body: TriageInput) -> dict:
    return triage.get_model().predict(body.model_dump())


@app.post("/assistant/guide", dependencies=auth)
def assistant_guide(body: GuideInput) -> dict:
    return rag.get_rag().answer(body.scenario, body.context.model_dump())


@app.post("/interactions/check", dependencies=auth)
def interactions_check(body: InteractionInput) -> dict:
    return {"warnings": interactions.check(body.medications, body.allergies)}

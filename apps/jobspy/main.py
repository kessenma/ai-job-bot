import logging
import os
from typing import Optional

import pandas as pd
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from jobspy import scrape_jobs

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("jobspy-service")

PORT = int(os.environ.get("PORT", 8085))

app = FastAPI(
    title="Job App Bot JobSpy Service",
    description="Multi-board job search service powered by JobSpy",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SearchRequest(BaseModel):
    sites: list[str]  # e.g. ["indeed", "glassdoor", "zip_recruiter", "google"]
    search_term: str
    location: Optional[str] = None
    distance: int = 50
    is_remote: bool = False
    job_type: Optional[str] = None  # fulltime, parttime, contract, internship
    results_wanted: int = 15
    hours_old: Optional[int] = None
    country: str = "usa"


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


@app.post("/search")
async def search_jobs(req: SearchRequest):
    try:
        logger.info(f"Searching {req.sites} for '{req.search_term}' in {req.location or 'anywhere'}")

        df = scrape_jobs(
            site_name=req.sites,
            search_term=req.search_term,
            location=req.location,
            distance=req.distance,
            is_remote=req.is_remote,
            job_type=req.job_type,
            results_wanted=req.results_wanted,
            hours_old=req.hours_old,
            country_indeed=req.country,
            description_format="markdown",
        )

        if df is None or df.empty:
            logger.info("No results found")
            return {"status": "ok", "results": [], "total": 0}

        # Normalize DataFrame to list of dicts with clean None values
        results = []
        for _, row in df.iterrows():
            date_posted = row.get("date_posted")
            if pd.notna(date_posted):
                date_posted = str(date_posted)
            else:
                date_posted = None

            results.append({
                "title": row.get("title") or "",
                "company": row.get("company") or "",
                "location": row.get("location") or "",
                "jobUrl": row.get("job_url") or "",
                "site": str(row.get("site", "")),
                "datePosted": date_posted,
                "description": row.get("description") if pd.notna(row.get("description")) else None,
                "salaryMin": float(row["min_amount"]) if pd.notna(row.get("min_amount")) else None,
                "salaryMax": float(row["max_amount"]) if pd.notna(row.get("max_amount")) else None,
                "salaryCurrency": row.get("currency") if pd.notna(row.get("currency")) else None,
                "salaryInterval": str(row["interval"]).lower() if pd.notna(row.get("interval")) else None,
                "jobType": str(row["job_type"]) if pd.notna(row.get("job_type")) else None,
                "isRemote": bool(row["is_remote"]) if pd.notna(row.get("is_remote")) else None,
            })

        logger.info(f"Found {len(results)} results across {req.sites}")
        return {"status": "ok", "results": results, "total": len(results)}

    except Exception as e:
        logger.error(f"Search failed: {e}", exc_info=True)
        return {"status": "error", "message": str(e), "results": []}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT)
